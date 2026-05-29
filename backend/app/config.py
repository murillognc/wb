"""
Application configuration for the WaterBrain backend.

Port of the *valves* + hardcoded behaviour from the GR WaterBrain Anthropic
Pipe v9.2 (the OpenWebUI function), re-expressed for the Claude Agent SDK.

PHILOSOPHY (carried over from the pipe):
    One use case: a high-stakes consultative assistant serving GR Water
    Solutions' leadership with revenue / operations analysis.
    Reliability > Cost > Speed > Flexibility.

Hardcoded behaviours (intentional — not exposed in the UI):
    - Extended Thinking is ALWAYS ON (budget 60k tokens).
    - Thinking is HIDDEN from the end-user by default (DISPLAY_THINKING valve).
    - 1M context window is ALWAYS ON (Agent SDK `betas` flag).
    - Aggressive prompt caching is ALWAYS ON (managed by the Agent SDK).
    - Only one model is exposed: Claude Opus 4.6 (Analise Confiavel).
    - Temperature is NOT exposed by the Agent SDK. Because thinking is forced
      on, Opus 4.x runs at temperature 1.0 regardless — determinism comes from
      the thinking pass, not from sampling. This matches where the pipe lands.

The only thing a user configures is the Anthropic API key (plus two optional
debug valves), set from the app's Settings page and persisted to backend/.env.
"""

from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Any, Dict

from dotenv import dotenv_values, set_key

# backend/.env  (this file lives at backend/app/config.py)
ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


class AppConfig:
    """In-memory config, backed by backend/.env.

    Thread-safe-ish: writes are guarded by a lock. Reads are plain attribute
    access (good enough for a single-tenant board app).
    """

    # ---- Hardcoded behaviour (do not change via UI) -------------------------
    MODEL_ID: str = "claude-opus-4-6"
    MODEL_NAME: str = "Claude Opus 4.6 - Analise Confiavel"

    THINKING_BUDGET_TOKENS: int = 60_000
    CONTEXT_1M_BETA: str = "context-1m-2025-08-07"

    MAX_RETRIES: int = 7
    BASE_RETRY_DELAY: float = 2.0
    MAX_TURNS: int = 1  # one assistant turn per user message (no autonomous tool loop)

    def __init__(self) -> None:
        self._lock = threading.Lock()

        # ---- Configurable valves (persisted) --------------------------------
        self.api_key: str = ""
        self.display_thinking: bool = False  # OFF for production (board-facing)
        self.show_cache_info: bool = True
        self.request_timeout: int = int(os.getenv("ANTHROPIC_REQUEST_TIMEOUT", "600"))

        self.load()

    # ------------------------------------------------------------------ load
    def load(self) -> None:
        """Load values from backend/.env (and env vars) into memory."""
        file_vals: Dict[str, str | None] = (
            dotenv_values(ENV_PATH) if ENV_PATH.exists() else {}
        )

        def pick(name: str, default: str = "") -> str:
            # Env var wins over file so deployments can inject secrets.
            return os.getenv(name) or file_vals.get(name) or default

        self.api_key = pick("ANTHROPIC_API_KEY", "")
        self.display_thinking = _as_bool(
            pick("ANTHROPIC_DISPLAY_THINKING", "false"), False
        )
        self.show_cache_info = _as_bool(pick("WB_SHOW_CACHE_INFO", "true"), True)
        timeout = pick("ANTHROPIC_REQUEST_TIMEOUT", "600")
        self.request_timeout = int(timeout) if str(timeout).isdigit() else 600

        # Make the key visible to the Claude CLI subprocess the SDK spawns.
        self._export_key()

    def _export_key(self) -> None:
        if self.api_key:
            os.environ["ANTHROPIC_API_KEY"] = self.api_key
        else:
            os.environ.pop("ANTHROPIC_API_KEY", None)

    # ----------------------------------------------------------------- write
    def update(
        self,
        *,
        api_key: str | None = None,
        display_thinking: bool | None = None,
        show_cache_info: bool | None = None,
    ) -> None:
        """Persist any provided fields to backend/.env and update memory."""
        with self._lock:
            ENV_PATH.parent.mkdir(parents=True, exist_ok=True)
            ENV_PATH.touch(exist_ok=True)

            if api_key is not None:
                api_key = api_key.strip()
                self.api_key = api_key
                # Empty string clears the key (set_key would still write it).
                set_key(str(ENV_PATH), "ANTHROPIC_API_KEY", api_key)
                self._export_key()

            if display_thinking is not None:
                self.display_thinking = bool(display_thinking)
                set_key(
                    str(ENV_PATH),
                    "ANTHROPIC_DISPLAY_THINKING",
                    "true" if display_thinking else "false",
                )

            if show_cache_info is not None:
                self.show_cache_info = bool(show_cache_info)
                set_key(
                    str(ENV_PATH),
                    "WB_SHOW_CACHE_INFO",
                    "true" if show_cache_info else "false",
                )

    # ---------------------------------------------------------------- public
    @property
    def key_set(self) -> bool:
        return bool(self.api_key)

    def public_dict(self) -> Dict[str, Any]:
        """Safe to send to the browser — never includes the API key itself."""
        return {
            "keySet": self.key_set,
            "model": {"id": self.MODEL_ID, "name": self.MODEL_NAME},
            "displayThinking": self.display_thinking,
            "showCacheInfo": self.show_cache_info,
            "thinkingBudget": self.THINKING_BUDGET_TOKENS,
            "context1m": True,
            "requestTimeout": self.request_timeout,
        }


def _as_bool(value: Any, default: bool) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


# Single shared instance.
config = AppConfig()
