"""
Persisted agent store — the source of truth for the WaterBrain specialists.

Replaces the old hardcoded roster (frontend PERSONAS_V2 + backend personas.py):
agents are now CRUD-managed via the admin screen and persisted to
``backend/data/agents.json``. The file is seeded on first run from the original
five specialists (appearance from the old frontend, system prompts from
personas.py) and is local runtime state (git-ignored).

Each agent record (camelCase to match the frontend persona object):
    id            str    stable slug
    role          str    display name ("Analista Financeiro")
    initials      str    monogram text ("Af")
    color         str    hex accent ("#5E83B8")
    area          str    short description (roster tooltip)
    quote         str    example question (roster tooltip)
    isExecutive   bool   orchestrator flag (the one that can delegate)
    model         str    Claude model id
    thinkingEnabled bool extended thinking on/off
    thinkingBudget  int  thinking token budget
    systemPrompt  str    full system prompt (editable)
    enabled       bool   show in the chat roster
    order         int    sort order
    quickPrompts  list   [{tag, short, text}] suggestion chips
"""

from __future__ import annotations

import json
import re
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

from . import personas

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
AGENTS_FILE = DATA_DIR / "agents.json"

# Editable, stored fields (anything else in a payload is ignored).
_FIELDS = {
    "role", "initials", "color", "area", "quote", "isExecutive", "model",
    "thinkingEnabled", "thinkingBudget", "systemPrompt", "enabled", "order",
    "quickPrompts",
}

# Appearance + UX seed (mirrors the original frontend PERSONAS_V2 / QUICK_PROMPTS).
_APPEARANCE: Dict[str, Dict[str, Any]] = {
    "executivo": {
        "initials": "Wb", "color": "#FA981A", "isExecutive": True,
        "area": "Coordena o time. Consolida visões de múltiplas perspectivas.",
        "quote": "Faça uma análise completa do desempenho de abril.",
        "quickPrompts": [
            {"tag": "ANÁLISE", "short": "Briefing executivo", "text": "Faça um briefing executivo de abril."},
            {"tag": "ALERTAS", "short": "Atenção esta semana", "text": "O que merece atenção esta semana?"},
            {"tag": "META", "short": "Ritmo do trimestre", "text": "Estamos no ritmo da meta trimestral?"},
            {"tag": "DECISÃO", "short": "3 ações críticas", "text": "Recomende as 3 ações mais críticas."},
        ],
    },
    "financeiro": {
        "initials": "Af", "color": "#5E83B8",
        "area": "Margens, EBITDA, custo financeiro e prazo médio.",
        "quote": "Como está nossa margem de contribuição em SP?",
        "quickPrompts": [
            {"tag": "MARGEM", "short": "Contribuição por unidade", "text": "Compare margem de contribuição por unidade."},
            {"tag": "EBITDA", "short": "Março vs abril", "text": "EBITDA mar vs abr por linha de produto."},
            {"tag": "PRAZO", "short": "Recebimento abril", "text": "Qual o prazo médio de recebimento em abril?"},
            {"tag": "CUSTO", "short": "Onde subiu", "text": "Onde subiu o custo financeiro?"},
        ],
    },
    "comercial": {
        "initials": "Gc", "color": "#4FA060",
        "area": "Carteira de clientes, mix de produto, performance regional.",
        "quote": "Quais clientes reduziram pedidos no trimestre?",
        "quickPrompts": [
            {"tag": "CARTEIRA", "short": "Quedas no trimestre", "text": "Quais clientes reduziram pedidos no trimestre?"},
            {"tag": "MIX", "short": "Mudança em SP", "text": "Como mudou o mix de produto em SP?"},
            {"tag": "REGIÃO", "short": "Performance regional", "text": "Performance comercial por região."},
            {"tag": "CHURN", "short": "Risco top 20", "text": "Risco de churn nos top 20 clientes."},
        ],
    },
    "operacional": {
        "initials": "Ao", "color": "#B97A3A",
        "area": "Devoluções, frete, ciclo e eficiência logística.",
        "quote": "Onde está o gargalo na entrega?",
        "quickPrompts": [
            {"tag": "FRETE", "short": "Por que subiu em SP", "text": "Por que o frete em SP subiu em abril?"},
            {"tag": "CICLO", "short": "Gargalo na entrega", "text": "Onde está o gargalo no ciclo de entrega?"},
            {"tag": "DEVOL", "short": "Aumento das devoluções", "text": "Por que aumentaram as devoluções?"},
            {"tag": "ESTOQUE", "short": "Cobertura SKU crítico", "text": "Cobertura de estoque por SKU crítico."},
        ],
    },
    "pdca": {
        "initials": "Cp", "color": "#7E8AA0",
        "area": "Metodologia, melhoria contínua, framework de gestão.",
        "quote": "Como estruturar um plano de ação pra reduzir retrabalho?",
        "quickPrompts": [
            {"tag": "PLANO", "short": "5W2H retrabalho", "text": "Monte um 5W2H pra reduzir retrabalho."},
            {"tag": "MÉTODO", "short": "PDCA na embalagem", "text": "Como aplicar PDCA na linha de embalagem?"},
            {"tag": "DIAG", "short": "Causa raiz", "text": "Diagnóstico de causa raiz · queixa recorrente."},
            {"tag": "INDIC.", "short": "O que monitorar", "text": "Quais indicadores monitorar nesse plano?"},
        ],
    },
}

_DEFAULTS = {
    "model": "claude-opus-4-6",
    "thinkingEnabled": True,
    "thinkingBudget": 60000,
    "enabled": True,
    "isExecutive": False,
    "color": "#7E8AA0",
    "initials": "Ag",
    "area": "",
    "quote": "",
    "quickPrompts": [],
}


def _seed() -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for i, pid in enumerate(personas.persona_ids()):
        ap = _APPEARANCE.get(pid, {})
        out.append({
            "id": pid,
            "role": personas.role_of(pid),
            "initials": ap.get("initials", "Ag"),
            "color": ap.get("color", "#7E8AA0"),
            "area": ap.get("area", ""),
            "quote": ap.get("quote", ""),
            "isExecutive": ap.get("isExecutive", False),
            "model": _DEFAULTS["model"],
            "thinkingEnabled": True,
            "thinkingBudget": _DEFAULTS["thinkingBudget"],
            "systemPrompt": personas.system_prompt_for(pid),
            "enabled": True,
            "order": i,
            "quickPrompts": ap.get("quickPrompts", []),
        })
    return out


def _slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (text or "").strip().lower()).strip("-")
    return s or "agente"


def _sanitize(data: Dict[str, Any]) -> Dict[str, Any]:
    """Keep only known fields and coerce simple types."""
    clean: Dict[str, Any] = {k: v for k, v in (data or {}).items() if k in _FIELDS and v is not None}
    if "thinkingBudget" in clean:
        try:
            clean["thinkingBudget"] = max(1024, min(200000, int(clean["thinkingBudget"])))
        except (TypeError, ValueError):
            clean.pop("thinkingBudget")
    for b in ("isExecutive", "thinkingEnabled", "enabled"):
        if b in clean:
            clean[b] = bool(clean[b])
    return clean


class AgentStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._agents: List[Dict[str, Any]] = self._load()

    # ----------------------------------------------------------------- io
    def _load(self) -> List[Dict[str, Any]]:
        if AGENTS_FILE.exists():
            try:
                data = json.loads(AGENTS_FILE.read_text(encoding="utf-8"))
                if isinstance(data, list) and data:
                    return data
            except (json.JSONDecodeError, OSError):
                pass
        seed = _seed()
        self._write(seed)
        return seed

    def _write(self, agents: List[Dict[str, Any]]) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        AGENTS_FILE.write_text(
            json.dumps(agents, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    # -------------------------------------------------------------- reads
    def list(self, include_disabled: bool = True) -> List[Dict[str, Any]]:
        with self._lock:
            items = sorted(self._agents, key=lambda a: a.get("order", 0))
            return [dict(a) for a in items if include_disabled or a.get("enabled", True)]

    def get(self, agent_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            for a in self._agents:
                if a["id"] == agent_id:
                    return dict(a)
        return None

    # ------------------------------------------------------------- writes
    def create(self, data: Dict[str, Any]) -> Dict[str, Any]:
        clean = _sanitize(data)
        with self._lock:
            existing = {a["id"] for a in self._agents}
            base = _slugify(clean.get("role", "agente"))
            agent_id = base
            n = 2
            while agent_id in existing:
                agent_id = f"{base}-{n}"
                n += 1
            record = {**_DEFAULTS, "id": agent_id, "role": clean.get("role", "Novo agente"),
                      "systemPrompt": clean.get("systemPrompt", ""),
                      "order": max((a.get("order", 0) for a in self._agents), default=-1) + 1}
            record.update(clean)
            record["id"] = agent_id  # never overridable
            self._agents.append(record)
            self._write(self._agents)
            return dict(record)

    def update(self, agent_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        clean = _sanitize(data)
        with self._lock:
            for a in self._agents:
                if a["id"] == agent_id:
                    a.update(clean)
                    self._write(self._agents)
                    return dict(a)
        return None

    def delete(self, agent_id: str) -> bool:
        with self._lock:
            before = len(self._agents)
            self._agents = [a for a in self._agents if a["id"] != agent_id]
            if len(self._agents) != before:
                self._write(self._agents)
                return True
        return False


store = AgentStore()
