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
from .personas import system_prompt_for

log = logging.getLogger("waterbrain.agent")

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


def _build_options(persona_id: str, cfg: AppConfig) -> ClaudeAgentOptions:
    display = "summarized" if cfg.display_thinking else "omitted"
    opts = ClaudeAgentOptions(
        model=cfg.MODEL_ID,
        system_prompt=system_prompt_for(persona_id),
        # Pure text consultative chat: no file/bash/web tools, no autonomy.
        # With no tools enabled there is nothing to request permission for, so
        # we leave permission_mode at its default — using "bypassPermissions"
        # would pass --dangerously-skip-permissions, which the CLI refuses to
        # run under root (common in containers).
        allowed_tools=[],
        max_turns=cfg.MAX_TURNS,
        # Surface CLI stderr into our logs for diagnostics.
        stderr=lambda line: log.debug("cli stderr: %s", line.rstrip()),
        # Hardcoded behaviours:
        thinking={
            "type": "enabled",
            "budget_tokens": cfg.THINKING_BUDGET_TOKENS,
            "display": display,
        },
        betas=[cfg.CONTEXT_1M_BETA],          # 1M context window
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


async def stream_reply(
    *,
    persona_id: str,
    message: str,
    history,
    cfg: AppConfig,
) -> AsyncGenerator[Dict[str, Any], None]:
    """Stream a persona's reply as a sequence of protocol dicts."""

    if not cfg.key_set:
        yield {
            "type": "error",
            "message": "ANTHROPIC_API_KEY nao configurada. "
            "Abra Configuracoes e cole sua chave da API.",
        }
        return

    prompt = _build_prompt(history, message)
    yield {"type": "status", "text": "Enviando para a Anthropic...", "done": False}

    last_error_msg: Optional[str] = None

    for attempt in range(cfg.MAX_RETRIES):
        options = _build_options(persona_id, cfg)

        captured_session: Optional[str] = None
        captured_usage: Optional[Dict[str, Any]] = None
        emitted_text = False          # any answer token reached the client?
        streamed_delta = False        # did partial StreamEvents carry the text?
        in_thinking = False
        err_code: Optional[str] = None
        err_status: Optional[int] = None
        retryable_failure = False

        try:
            async for msg in query(prompt=prompt, options=options):

                # -- partial token stream (raw Anthropic SSE events) ----------
                if isinstance(msg, StreamEvent):
                    ev = msg.event or {}
                    etype = ev.get("type")
                    if etype == "content_block_start":
                        block = ev.get("content_block", {}) or {}
                        btype = block.get("type")
                        if btype == "thinking":
                            in_thinking = True
                            yield {"type": "status", "text": "Raciocinando...", "done": False}
                        elif btype == "text":
                            in_thinking = False
                            yield {"type": "status", "text": "Analisando dados...", "done": False}
                    elif etype == "content_block_delta":
                        delta = ev.get("delta", {}) or {}
                        dtype = delta.get("type")
                        if dtype == "text_delta":
                            txt = delta.get("text", "")
                            if txt:
                                streamed_delta = True
                                emitted_text = True
                                yield {"type": "text", "text": txt}
                        elif dtype == "thinking_delta" and cfg.display_thinking:
                            think = delta.get("thinking", "")
                            if think:
                                yield {"type": "thinking", "text": think}
                    elif etype == "content_block_stop" and in_thinking:
                        in_thinking = False
                        yield {"type": "status", "text": "Raciocinio concluido", "done": False}
                    continue

                # -- assembled assistant message ------------------------------
                if isinstance(msg, AssistantMessage):
                    if msg.error:
                        err_code = msg.error
                        if _is_retryable(err_code, None) and not emitted_text:
                            retryable_failure = True
                            break
                        last_error_msg = _friendly_error(err_code, None)
                        yield {"type": "error", "message": last_error_msg}
                        return
                    # Fallback: if partial streaming didn't carry the text,
                    # emit the assembled blocks now so the answer never vanishes.
                    if not streamed_delta:
                        for block in msg.content:
                            if isinstance(block, TextBlock) and block.text:
                                emitted_text = True
                                yield {"type": "text", "text": block.text}
                            elif (
                                isinstance(block, ThinkingBlock)
                                and cfg.display_thinking
                                and getattr(block, "thinking", "")
                            ):
                                yield {"type": "thinking", "text": block.thinking}
                    continue

                # -- session bootstrap ---------------------------------------
                if isinstance(msg, SystemMessage):
                    sid = (msg.data or {}).get("session_id")
                    if sid:
                        captured_session = sid
                    continue

                # -- final result --------------------------------------------
                if isinstance(msg, ResultMessage):
                    captured_usage = msg.usage
                    if msg.session_id:
                        captured_session = msg.session_id
                    if msg.is_error:
                        err_status = msg.api_error_status
                        if _is_retryable(None, err_status) and not emitted_text:
                            retryable_failure = True
                            break
                        last_error_msg = _friendly_error(None, err_status)
                        yield {"type": "error", "message": last_error_msg}
                        return
                    log.info(
                        "USAGE | in=%s out=%s cache_read=%s cache_create=%s | cost_usd=%s",
                        (captured_usage or {}).get("input_tokens"),
                        (captured_usage or {}).get("output_tokens"),
                        (captured_usage or {}).get("cache_read_input_tokens"),
                        (captured_usage or {}).get("cache_creation_input_tokens"),
                        msg.total_cost_usd,
                    )
                    continue

        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 — surface SDK/CLI failures gracefully
            # SDK/CLI startup failures (ProcessError, etc.) are config problems,
            # not transient API hiccups — don't burn retries on them. Transient
            # API errors arrive as AssistantMessage.error / ResultMessage.is_error
            # above and are retried there.
            log.exception("Agent SDK query failed")
            yield {
                "type": "error",
                "message": "Falha ao executar o agente. Verifique a chave da API "
                "e os logs do servidor.",
            }
            return

        if retryable_failure and attempt < cfg.MAX_RETRIES - 1:
            # Exponential backoff, capped so a long outage can't wedge a request.
            delay = min(cfg.BASE_RETRY_DELAY ** (attempt + 1), 30.0) + random.uniform(0, 1)
            log.warning(
                "Transient failure (code=%s status=%s). Retry %s/%s in %.1fs",
                err_code, err_status, attempt + 1, cfg.MAX_RETRIES, delay,
            )
            yield {
                "type": "status",
                "text": f"Tentando novamente ({attempt + 1}/{cfg.MAX_RETRIES})...",
                "done": False,
            }
            await asyncio.sleep(delay)
            continue

        # Success path (or non-retryable error already returned above).
        cache_info = _cache_info(captured_usage) if cfg.show_cache_info else None
        yield {"type": "status", "text": "Resposta concluida", "done": True}
        yield {"type": "meta", "sessionId": captured_session, "cacheInfo": cache_info}
        yield {"type": "done"}
        return

    # Exhausted retries without ever succeeding.
    yield {
        "type": "error",
        "message": last_error_msg or "Maximo de tentativas excedido.",
    }
