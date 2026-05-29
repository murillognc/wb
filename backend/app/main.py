"""
WaterBrain backend — FastAPI app.

Serves the existing prototype (the project/ folder, unchanged HTML/CSS/JSX —
React + Babel transpile in the browser) and exposes a small JSON/SSE API that
drives the Claude Agent SDK.

Routes:
    GET  /                  -> the dashboard HTML
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
from .config import config
from .personas import is_valid, roster
from .schemas import ChatRequest, ConfigUpdate

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] [waterbrain] %(message)s",
)
log = logging.getLogger("waterbrain")

# project/ holds the prototype (this file is backend/app/main.py).
PROJECT_DIR = Path(__file__).resolve().parent.parent.parent / "project"
INDEX_HTML = PROJECT_DIR / "WaterBrain Dashboard.html"

app = FastAPI(title="WaterBrain", version="1.0.0")


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


@app.get("/api/personas")
async def get_personas() -> dict:
    return {"personas": roster()}


@app.post("/api/chat")
async def chat(req: ChatRequest):
    if not is_valid(req.persona_id):
        raise HTTPException(status_code=400, detail=f"persona desconhecida: {req.persona_id}")

    async def event_source():
        try:
            async for event in stream_reply(
                persona_id=req.persona_id,
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
    return FileResponse(INDEX_HTML)


# Everything else (css, jsx, fonts, assets, the homepage) is served as-is.
# Mounted last so the /api routes and / above take precedence.
app.mount("/", StaticFiles(directory=str(PROJECT_DIR), html=True), name="static")
