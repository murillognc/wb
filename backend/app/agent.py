"""
Claude Agent SDK driver for WaterBrain.

This is the port of the GR WaterBrain Anthropic Pipe v9.2 onto the Claude Agent
SDK. It keeps the pipe's hardcoded behaviour and observability, but instead of
hand-rolling HTTP + SSE parsing against the Messages API, it drives the Agent
SDK (`claude_agent_sdk.query`) which spawns the bundled Claude CLI.

Behaviour parity with the pipe
------------------------------
- Extended Thinking ALWAYS ON, budget 60k       -> options.thinking (enabled)
- Thinking HIDDEN by default                     -> thinking display "omitted"
                                                    ("summarized" when valve on)
- 1M context ALWAYS ON                           -> options.betas
- Aggressive prompt caching ALWAYS ON            -> managed by the Agent SDK
- Opus 4.6 only                                  -> options.model
- 7 retries w/ exponential backoff on transient  -> _RETRYABLE handling below
- PT-BR status emitter                           -> "status" events
- Token / cache usage logged + optional in reply -> ResultMessage.usage

What the Agent SDK does not expose
----------------------------------
- temperature / top_p / top_k: not configurable. With thinking forced on,
  Opus 4.x runs at temperature 1.0 anyway; determinism comes from the thinking
  pass. This matches the regime the pipe ends up in.

Streaming protocol (yielded dicts, serialised as SSE by the route)
------------------------------------------------------------------
    {"type": "status",   "text": str, "done": bool}
    {"type": "thinking", "text": str}      # only when display_thinking is on
    {"type": "text",     "text": str}      # answer tokens / chunks
    {"type": "meta",     "sessionId": str, "cacheInfo": str|None}
    {"type": "error",    "message": str}
    {"type": "done"}
"""

from __future__ import annotations

import asyncio
import logging
import random
import shutil
from typing import Any, AsyncGenerator, Dict, Optional

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ResultMessage,
    StreamEvent,
    SystemMessage,
    TextBlock,
    ThinkingBlock,
    query,
)

from .config import AppConfig
from .agents_store import store as agent_store

log = logging.getLogger("waterbrain.agent")

# Router used by the orchestrator to pick which specialists to consult.
_ROUTER_SYS = (
    "Você é um roteador de especialistas. Dada a mensagem do usuário e a lista de "
    "especialistas disponíveis, escolha APENAS os que são realmente necessários "
    "para responder bem (seja seletivo: muitas vezes 1 ou 2 bastam, às vezes nenhum). "
    "Responda somente com os ids separados por vírgula, ou a palavra 'nenhum'."
)
_MAX_CONSULTS = 3

# Appended to every agent's system prompt: our agents are pure-text analysts
# with no tools, so they must not pretend to query systems or invent data.
_GUARDRAIL = (
    "\n\n[Importante] Você não tem acesso a bancos de dados, APIs, internet ou "
    "ferramentas externas. Responda apenas com base no que foi fornecido na "
    "conversa. Quando faltar um dado, diga claramente o que falta e, se útil, "
    "trabalhe com uma premissa explícita — nunca finja consultar sistemas, "
    "acessar URLs ou inventar números."
)

# Assistant-level / result-level error codes worth retrying.
_RETRYABLE_ERRORS = {"rate_limit", "server_error"}
_RETRYABLE_HTTP = {429, 500, 502, 503, 504}

# Cached lookup of the bundled/installed Claude CLI so we don't re-resolve it.
_CLI_PATH = shutil.which("claude")


# Conversation is replayed each request (query() is stateless). Cap how much
# history we resend so a long thread can't balloon a single request.
_MAX_HISTORY_TURNS = 16
_MAX_TURN_CHARS = 4000


def _build_prompt(history, message: str) -> str:
    """Embed recent turns as context so the persona has conversation memory.

    The transcript goes in the *user* prompt (not the system prompt) so the
    stable, cacheable system prefix stays identical across the conversation.
    """
    turns = [t for t in (history or []) if getattr(t, "text", "").strip()]
    turns = turns[-_MAX_HISTORY_TURNS:]
    if not turns:
        return message

    lines = []
    for t in turns:
        who = "Usuario" if t.role == "user" else "Voce (resposta anterior)"
        text = t.text.strip()
        if len(text) > _MAX_TURN_CHARS:
            text = text[:_MAX_TURN_CHARS] + " […]"
        lines.append(f"{who}: {text}")
    transcript = "\n\n".join(lines)
    return (
        "Historico da conversa ate aqui (apenas para contexto; nao repita, use "
        f"como memoria):\n\"\"\"\n{transcript}\n\"\"\"\n\n"
        f"Mensagem atual do usuario:\n{message}"
    )


def _build_options(agent: Dict[str, Any], cfg: AppConfig) -> ClaudeAgentOptions:
    # Reasoning is now surfaced live in the chat (collapsible), so we ask for
    # summarized thinking whenever thinking is enabled for the agent.
    if agent.get("thinkingEnabled", True):
        thinking: Dict[str, Any] = {
            "type": "enabled",
            "budget_tokens": int(agent.get("thinkingBudget", cfg.THINKING_BUDGET_TOKENS)),
            "display": "summarized",
        }
    else:
        thinking = {"type": "disabled"}

    system_prompt = (agent.get("systemPrompt") or "") + _GUARDRAIL

    opts = ClaudeAgentOptions(
        model=agent.get("model") or cfg.MODEL_ID,
        system_prompt=system_prompt,
        # Pure text consultative chat: no file/bash/web tools, no autonomy.
        # With no tools enabled there is nothing to request permission for, so
        # we leave permission_mode at its default — using "bypassPermissions"
        # would pass --dangerously-skip-permissions, which the CLI refuses to
        # run under root (common in containers).
        allowed_tools=[],
        max_turns=cfg.MAX_TURNS,
        # Surface CLI stderr into our logs for diagnostics.
        stderr=lambda line: log.debug("cli stderr: %s", line.rstrip()),
        thinking=thinking,
        betas=[cfg.CONTEXT_1M_BETA],          # 1M context window (always on)
        include_partial_messages=True,        # token-level streaming
        # Isolation: ignore user/project/local settings on the host.
        setting_sources=None,
    )
    if _CLI_PATH:
        opts.cli_path = _CLI_PATH
    return opts


def _cache_info(usage: Optional[Dict[str, Any]]) -> Optional[str]:
    """PT-BR cache block, mirroring the pipe's _get_cache_info."""
    if not usage:
        return None
    inp = usage.get("input_tokens", 0) or 0
    out = usage.get("output_tokens", 0) or 0
    cached = usage.get("cache_read_input_tokens", 0) or 0
    created = usage.get("cache_creation_input_tokens", 0) or 0

    if cached > 0:
        pct = (cached / inp * 100) if inp > 0 else 0.0
        return (
            f"\n```\n"
            f"Cache HIT: {pct:.1f}%\n"
            f"Tokens: {inp:,} in / {out:,} out / {cached:,} cached\n"
            f"```\n"
        )
    if created > 0:
        return (
            f"\n```\n"
            f"Cache CRIADO: {created:,} tokens\n"
            f"Tokens: {inp:,} in / {out:,} out\n"
            f"```\n"
        )
    return (
        f"\n```\n"
        f"Cache MISS\n"
        f"Tokens: {inp:,} in / {out:,} out\n"
        f"```\n"
    )


def _friendly_error(code: str | None, status: int | None) -> str:
    mapping = {
        "authentication_failed": "Chave da API invalida ou nao autorizada. "
        "Confira a chave em Configuracoes.",
        "billing_error": "Problema de faturamento na conta Anthropic.",
        "rate_limit": "Limite de requisicoes atingido. Tente novamente em instantes.",
        "invalid_request": "Requisicao invalida enviada ao modelo.",
        "server_error": "Erro temporario no servidor da Anthropic.",
    }
    if code and code in mapping:
        return mapping[code]
    if status:
        return f"Falha na API (HTTP {status})."
    return "Nao foi possivel obter resposta do modelo."


def _is_retryable(code: str | None, status: int | None) -> bool:
    return (code in _RETRYABLE_ERRORS) or (status in _RETRYABLE_HTTP)


async def _stream_agent(
    agent: Dict[str, Any],
    prompt: str,
    cfg: AppConfig,
    *,
    agent_id: str,
    role: str,
    capture: Optional[list] = None,
) -> AsyncGenerator[Dict[str, Any], None]:
    """Stream ONE agent's contribution, tagged with its agentId.

    Emits: agent_begin → (status|thinking|text|meta)* → agent_done. Reasoning
    (thinking) streams live. If `capture` is given, the final answer text is
    appended to it (used to feed the orchestrator's synthesis). Does NOT emit
    the turn-level "done" — the caller does that once."""

    yield {"type": "agent_begin", "agentId": agent_id, "role": role}
    last_error_msg: Optional[str] = None

    for attempt in range(cfg.MAX_RETRIES):
        options = _build_options(agent, cfg)
        captured_usage: Optional[Dict[str, Any]] = None
        answer_parts: list[str] = []
        emitted_text = False
        streamed_delta = False
        in_thinking = False
        err_code: Optional[str] = None
        err_status: Optional[int] = None
        retryable_failure = False

        try:
            async for msg in query(prompt=prompt, options=options):

                if isinstance(msg, StreamEvent):
                    ev = msg.event or {}
                    etype = ev.get("type")
                    if etype == "content_block_start":
                        block = ev.get("content_block", {}) or {}
                        btype = block.get("type")
                        if btype == "thinking":
                            in_thinking = True
                            yield {"type": "status", "agentId": agent_id, "text": "Raciocinando..."}
                        elif btype == "text":
                            in_thinking = False
                            yield {"type": "status", "agentId": agent_id, "text": "Escrevendo resposta..."}
                    elif etype == "content_block_delta":
                        delta = ev.get("delta", {}) or {}
                        dtype = delta.get("type")
                        if dtype == "text_delta":
                            txt = delta.get("text", "")
                            if txt:
                                streamed_delta = True
                                emitted_text = True
                                answer_parts.append(txt)
                                yield {"type": "text", "agentId": agent_id, "text": txt}
                        elif dtype == "thinking_delta":
                            think = delta.get("thinking", "")
                            if think:
                                yield {"type": "thinking", "agentId": agent_id, "text": think}
                    continue

                if isinstance(msg, AssistantMessage):
                    if msg.error:
                        err_code = msg.error
                        if _is_retryable(err_code, None) and not emitted_text:
                            retryable_failure = True
                            break
                        last_error_msg = _friendly_error(err_code, None)
                        yield {"type": "error", "agentId": agent_id, "message": last_error_msg}
                        yield {"type": "agent_done", "agentId": agent_id}
                        return
                    if not streamed_delta:  # fallback when partial streaming was off
                        for block in msg.content:
                            if isinstance(block, TextBlock) and block.text:
                                emitted_text = True
                                answer_parts.append(block.text)
                                yield {"type": "text", "agentId": agent_id, "text": block.text}
                            elif isinstance(block, ThinkingBlock) and getattr(block, "thinking", ""):
                                yield {"type": "thinking", "agentId": agent_id, "text": block.thinking}
                    continue

                if isinstance(msg, ResultMessage):
                    captured_usage = msg.usage
                    if msg.is_error:
                        err_status = msg.api_error_status
                        if _is_retryable(None, err_status) and not emitted_text:
                            retryable_failure = True
                            break
                        last_error_msg = _friendly_error(None, err_status)
                        yield {"type": "error", "agentId": agent_id, "message": last_error_msg}
                        yield {"type": "agent_done", "agentId": agent_id}
                        return
                    log.info(
                        "USAGE %s | in=%s out=%s cache_read=%s cache_create=%s | cost=%s",
                        agent_id,
                        (captured_usage or {}).get("input_tokens"),
                        (captured_usage or {}).get("output_tokens"),
                        (captured_usage or {}).get("cache_read_input_tokens"),
                        (captured_usage or {}).get("cache_creation_input_tokens"),
                        msg.total_cost_usd,
                    )
                    continue

        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 — surface SDK/CLI failures gracefully
            log.exception("Agent SDK query failed for %s", agent_id)
            yield {"type": "error", "agentId": agent_id,
                   "message": "Falha ao executar o agente. Verifique a chave da API e os logs."}
            yield {"type": "agent_done", "agentId": agent_id}
            return

        if retryable_failure and attempt < cfg.MAX_RETRIES - 1:
            delay = min(cfg.BASE_RETRY_DELAY ** (attempt + 1), 30.0) + random.uniform(0, 1)
            log.warning("Transient failure (%s/%s) for %s, retry in %.1fs",
                        attempt + 1, cfg.MAX_RETRIES, agent_id, delay)
            yield {"type": "status", "agentId": agent_id,
                   "text": f"Tentando novamente ({attempt + 1}/{cfg.MAX_RETRIES})..."}
            await asyncio.sleep(delay)
            continue

        # Success.
        if capture is not None:
            capture.append("".join(answer_parts).strip())
        cache_info = _cache_info(captured_usage) if cfg.show_cache_info else None
        if cache_info:
            yield {"type": "meta", "agentId": agent_id, "cacheInfo": cache_info}
        yield {"type": "agent_done", "agentId": agent_id}
        return

    yield {"type": "error", "agentId": agent_id,
           "message": last_error_msg or "Maximo de tentativas excedido."}
    yield {"type": "agent_done", "agentId": agent_id}


# ===================================================================
# Multi-agent orchestration
# Each specialist consultation is a REAL Agent SDK call (pure text, no
# system tools). The orchestrator routes, the chosen specialists run in
# parallel, then the orchestrator synthesises — so "entrou no chat"
# reflects specialists that were actually invoked via the SDK.
# ===================================================================

async def _collect(agent_like: Dict[str, Any], prompt: str, cfg: AppConfig) -> str:
    """Run one agent to completion and return its full answer text."""
    options = _build_options(agent_like, cfg)
    parts: list[str] = []
    try:
        async for msg in query(prompt=prompt, options=options):
            if isinstance(msg, AssistantMessage) and not msg.error:
                for b in msg.content:
                    if isinstance(b, TextBlock) and b.text:
                        parts.append(b.text)
    except Exception:  # noqa: BLE001
        log.exception("consult failed for agent %s", agent_like.get("id"))
    return "".join(parts).strip()


async def _route(orch: Dict[str, Any], message: str, specialists: list, cfg: AppConfig) -> list:
    """Ask the orchestrator (thinking off) which specialists to consult."""
    if not specialists:
        return []
    listing = "\n".join(f"- {s['id']}: {s['role']} — {s.get('area', '')}" for s in specialists)
    router = {
        "model": orch.get("model") or cfg.MODEL_ID,
        "systemPrompt": _ROUTER_SYS,
        "thinkingEnabled": False,
    }
    rp = (
        f"Especialistas disponíveis:\n{listing}\n\n"
        f"Mensagem do usuário:\n{message}\n\n"
        "Ids dos especialistas a consultar (ou 'nenhum'):"
    )
    out = (await _collect(router, rp, cfg)).lower()
    chosen = [s for s in specialists if s["id"] in out or s["role"].lower() in out]
    return chosen[:_MAX_CONSULTS]


def _synthesis_prompt(prompt: str, results: list) -> str:
    blocks = "\n\n".join(f"### {sp['role']}\n{text}" for sp, text in results if text)
    return (
        f"{prompt}\n\n"
        "[Contribuições dos especialistas que você consultou]\n"
        f"{blocks}\n\n"
        "[Sua tarefa] Sintetize as contribuições acima em uma resposta executiva, "
        "coesa e objetiva em PT-BR. Integre os pontos (não repita em blocos), e "
        "atribua aos especialistas quando agregar clareza."
    )


async def _orchestrate(
    orch: Dict[str, Any], prompt: str, message: str, specialists: list, cfg: AppConfig
) -> AsyncGenerator[Dict[str, Any], None]:
    yield {"type": "status", "text": "Selecionando especialistas..."}
    chosen = await _route(orch, message, specialists, cfg)

    if not chosen:
        async for ev in _stream_agent(orch, prompt, cfg, agent_id=orch["id"], role=orch["role"]):
            yield ev
        yield {"type": "done"}
        return

    # Each chosen specialist streams its reasoning + answer live, in turn.
    consult_prompt = (
        prompt + "\n\n[Instrução] Responda de forma objetiva e focada na sua "
        "especialidade; suas notas serão consolidadas pelo orquestrador."
    )
    results = []
    for sp in chosen:
        cap: list = []
        async for ev in _stream_agent(
            sp, consult_prompt, cfg, agent_id=sp["id"], role=sp["role"], capture=cap
        ):
            yield ev
        results.append((sp, cap[0] if cap else ""))

    # Orchestrator synthesises the specialists' contributions.
    yield {"type": "status", "text": "Sintetizando o briefing..."}
    async for ev in _stream_agent(
        orch, _synthesis_prompt(prompt, results), cfg, agent_id=orch["id"], role=orch["role"]
    ):
        yield ev
    yield {"type": "done"}


async def stream_reply(
    *,
    agent: Dict[str, Any],
    message: str,
    history,
    cfg: AppConfig,
) -> AsyncGenerator[Dict[str, Any], None]:
    """Entry point: orchestrate (if the agent is an orchestrator) or answer directly."""
    if not cfg.key_set:
        yield {
            "type": "error",
            "message": "ANTHROPIC_API_KEY nao configurada. "
            "Abra Configuracoes e cole sua chave da API.",
        }
        return

    prompt = _build_prompt(history, message)
    yield {"type": "status", "text": "Enviando para a Anthropic..."}

    specialists = [
        a for a in agent_store.list(include_disabled=False)
        if not a.get("isExecutive") and a["id"] != agent["id"]
    ]

    if agent.get("isExecutive") and specialists:
        async for ev in _orchestrate(agent, prompt, message, specialists, cfg):
            yield ev
    else:
        async for ev in _stream_agent(agent, prompt, cfg, agent_id=agent["id"], role=agent["role"]):
            yield ev
        yield {"type": "done"}
