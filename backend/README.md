# WaterBrain — Backend

FastAPI backend that serves the WaterBrain dashboard (the `project/` prototype,
unchanged HTML/CSS/JSX — React + Babel run in the browser) and talks to Claude
through the **Claude Agent SDK**.

It is a port of the GR WaterBrain **Anthropic Pipe v9.2** (the OpenWebUI
function) onto the Agent SDK: same hardcoded behaviour and observability, but
driven by `claude_agent_sdk.query` instead of hand-rolled HTTP.

## Quick start

```bash
cd backend
./run.sh                 # creates .venv, installs deps, serves on :8000
```

Then open **http://localhost:8000**, click the ⚙ gear (top-right), and paste
your Anthropic API key. That's the only thing you configure — it's saved to
`backend/.env` on the server and **never** sent to the browser.

Manual setup (equivalent to `run.sh`):

```bash
cd backend
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/uvicorn app.main:app --reload --port 8000
```

You can also set the key without the UI by editing `backend/.env`
(see `.env.example`).

## API

| Method | Path             | Purpose                                              |
| ------ | ---------------- | ---------------------------------------------------- |
| GET    | `/`              | The dashboard HTML                                   |
| GET    | `/api/health`    | Liveness + whether a key is set                      |
| GET    | `/api/config`    | Public config (model, valves) — never the key        |
| POST   | `/api/config`    | Set API key / debug valves (persists to `.env`)      |
| GET    | `/api/personas`  | Roster metadata                                      |
| POST   | `/api/chat`      | **SSE stream** of a persona's reply                  |

`POST /api/chat` body:
`{ "persona_id": "financeiro", "message": "...", "history": [{"role":"user","text":"..."}, ...] }`.
The response is `text/event-stream` with `data:` lines carrying these events:

```
{"type":"status",   "text":"Raciocinando...", "done":false}
{"type":"thinking", "text":"..."}        # only when display_thinking is on
{"type":"text",     "text":"..."}        # answer tokens
{"type":"meta",     "cacheInfo":"...|null"}
{"type":"error",    "message":"..."}
{"type":"done"}
```

The Agent SDK's `query()` is **stateless** (each call is independent), so the
frontend replays the recent thread in `history` with every request — that's how
each specialist keeps conversation context. The backend caps replayed history
(last 16 turns) and the stable per-persona system prompt stays cached across the
conversation.

## Behaviour parity with the v9.2 pipe

| Pipe behaviour                          | Status | How (Agent SDK)                                   |
| --------------------------------------- | ------ | ------------------------------------------------- |
| Extended Thinking ALWAYS ON (60k)       | ✅     | `thinking={"type":"enabled","budget_tokens":60000}` |
| Thinking HIDDEN by default              | ✅     | `display:"omitted"` (`"summarized"` when valve on)  |
| 1M context window ALWAYS ON             | ✅     | `betas=["context-1m-2025-08-07"]`                  |
| Aggressive prompt caching ALWAYS ON     | ✅     | Managed automatically by the Agent SDK             |
| Only Claude Opus 4.6 exposed            | ✅     | `model="claude-opus-4-6"`                          |
| 7 retries, exponential backoff          | ✅     | Retry on `rate_limit` / `server_error` / 5xx       |
| PT-BR status emitter                    | ✅     | `status` SSE events                                |
| Token + cache-hit reporting             | ✅     | `ResultMessage.usage` → logged + optional in reply |
| API key from env / settings only        | ✅     | `backend/.env`, set via the Settings page          |
| **Temperature forced to 0.0**           | ⚠️     | **Not exposed by the Agent SDK.** With thinking forced on, Opus 4.x runs at temperature 1.0 anyway — determinism comes from the thinking pass, exactly the regime the pipe lands in. |

No file/bash/web tools are enabled (`allowed_tools=[]`, `permission_mode="bypassPermissions"`)
— this is a pure consultative text chat. Host settings are ignored
(`setting_sources=None`) so the agent is fully isolated.

## Layout

```
backend/
  app/
    main.py       FastAPI app: static serving + API routes + SSE
    config.py     Valves + hardcoded behaviour, backed by backend/.env
    personas.py   The 5 specialists and their PT-BR system prompts
    agent.py      The v9.2 pipe ported onto the Claude Agent SDK
    schemas.py    Request models
  requirements.txt
  .env.example
  run.sh
```

## Requirements

- Python 3.10+
- The Claude CLI (bundled with `claude-agent-sdk`; this repo's environment also
  has it on `PATH`). The SDK spawns it as a subprocess per request.
