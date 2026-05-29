"""
WaterBrain backend — FastAPI app.

Serves the existing prototype (the project/ folder, unchanged HTML/CSS/JSX —
React + Babel transpile in the browser) and exposes a small JSON/SSE API that
drives the Claude Agent SDK.

Routes:
    GET  /                  -> the homepage (landing — never straight to chat)
    GET  /chat              -> the dashboard (chat) HTML
    GET  /api/health        -> liveness
    GET  /api/config        -> public config (never the key)
    POST /api/config        -> set API key / debug valves (persists to .env)
    GET  /api/personas      -> roster metadata
    POST /api/chat          -> SSE stream of a persona's reply

Run:
    uvicorn app.main:app --reload --port 8000      (from the backend/ dir)
then open http://localhost:8000
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from .agent import stream_reply
from .agents_store import store as agent_store
from .config import config
from .schemas import AgentPayload, ChatRequest, ConfigUpdate

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] [waterbrain] %(message)s",
)
log = logging.getLogger("waterbrain")

# project/ holds the prototype (this file is backend/app/main.py).
PROJECT_DIR = Path(__file__).resolve().parent.parent.parent / "project"
HOMEPAGE_HTML = PROJECT_DIR / "WaterBrain Homepage.html"
DASHBOARD_HTML = PROJECT_DIR / "WaterBrain Dashboard.html"

app = FastAPI(title="WaterBrain", version="1.0.0")


# The prototype is plain HTML/CSS/JSX transpiled in the browser; if the browser
# caches an old .jsx/.css it can run against a newer backend protocol and break
# (e.g. bubbles all collapsing to one agent). Disable caching for app assets.
@app.middleware("http")
async def no_store_assets(request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path in ("/", "/chat", "/dashboard") or path.endswith((".html", ".jsx", ".js", ".css")):
        response.headers["Cache-Control"] = "no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
    return response


# ---------------------------------------------------------------- API routes
@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok", "keySet": config.key_set}


@app.get("/api/config")
async def get_config() -> dict:
    return config.public_dict()


@app.post("/api/config")
async def post_config(update: ConfigUpdate) -> dict:
    config.update(
        api_key=update.api_key,
        display_thinking=update.display_thinking,
        show_cache_info=update.show_cache_info,
    )
    log.info("Config updated (keySet=%s, displayThinking=%s, showCacheInfo=%s)",
             config.key_set, config.display_thinking, config.show_cache_info)
    return config.public_dict()


# ----------------------------------------------------------------- agents CRUD
@app.get("/api/agents")
async def list_agents() -> dict:
    return {"agents": agent_store.list(include_disabled=True)}


@app.post("/api/agents", status_code=201)
async def create_agent(payload: AgentPayload) -> dict:
    data = payload.model_dump(exclude_none=True)
    if not data.get("role"):
        raise HTTPException(status_code=400, detail="role (nome) é obrigatório")
    agent = agent_store.create(data)
    log.info("Agent created: %s (%s)", agent["id"], agent["role"])
    return agent


@app.put("/api/agents/{agent_id}")
async def update_agent(agent_id: str, payload: AgentPayload) -> dict:
    agent = agent_store.update(agent_id, payload.model_dump(exclude_none=True))
    if not agent:
        raise HTTPException(status_code=404, detail=f"agente não encontrado: {agent_id}")
    log.info("Agent updated: %s", agent_id)
    return agent


@app.delete("/api/agents/{agent_id}")
async def delete_agent(agent_id: str) -> dict:
    if not agent_store.delete(agent_id):
        raise HTTPException(status_code=404, detail=f"agente não encontrado: {agent_id}")
    log.info("Agent deleted: %s", agent_id)
    return {"ok": True}


@app.post("/api/chat")
async def chat(req: ChatRequest):
    agent = agent_store.get(req.persona_id)
    if not agent:
        raise HTTPException(status_code=400, detail=f"agente desconhecido: {req.persona_id}")
    if not agent.get("enabled", True):
        raise HTTPException(status_code=400, detail=f"agente inativo: {req.persona_id}")

    async def event_source():
        try:
            async for event in stream_reply(
                agent=agent,
                message=req.message,
                history=req.history,
                cfg=config,
            ):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except Exception as exc:  # noqa: BLE001
            log.exception("Streaming failed")
            payload = {"type": "error", "message": f"Erro de streaming: {exc}"}
            yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ------------------------------------------------------------ static / index
@app.get("/")
async def index() -> FileResponse:
    # Hitting the app always lands on the homepage, never straight into chat.
    return FileResponse(HOMEPAGE_HTML)


@app.get("/chat")
@app.get("/dashboard")
async def dashboard() -> FileResponse:
    # The conversational dashboard lives here (the homepage links to it).
    return FileResponse(DASHBOARD_HTML)


# Everything else (css, jsx, fonts, assets, the homepage) is served as-is.
# Mounted last so the /api routes and / above take precedence.
app.mount("/", StaticFiles(directory=str(PROJECT_DIR), html=True), name="static")
