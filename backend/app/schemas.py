"""Pydantic request models for the WaterBrain API."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class AgentPayload(BaseModel):
    """Create/update payload for an agent. All optional; the store fills defaults
    and ignores unknown keys. `model` would clash with pydantic's protected
    namespace, so we disable that protection."""

    model_config = ConfigDict(protected_namespaces=(), extra="ignore")

    role: str | None = None
    initials: str | None = None
    color: str | None = None
    area: str | None = None
    quote: str | None = None
    isExecutive: bool | None = None
    model: str | None = None
    thinkingEnabled: bool | None = None
    thinkingBudget: int | None = None
    systemPrompt: str | None = None
    enabled: bool | None = None
    order: int | None = None
    quickPrompts: list[dict] | None = None


class ConfigUpdate(BaseModel):
    """Settings page payload. All fields optional — only provided ones change."""

    api_key: str | None = Field(default=None, description="Anthropic API key")
    display_thinking: bool | None = Field(
        default=None, description="Expose Claude's reasoning in the chat (debug)"
    )
    show_cache_info: bool | None = Field(
        default=None, description="Append cache hit/miss stats to replies"
    )


class ChatTurn(BaseModel):
    role: str = Field(..., description="'user' or 'assistant'")
    text: str = Field(..., description="Turn content")


class ChatRequest(BaseModel):
    persona_id: str = Field(..., description="Roster id, e.g. 'financeiro'")
    message: str = Field(..., min_length=1, description="User message")
    history: list[ChatTurn] = Field(
        default_factory=list,
        description="Recent prior turns for context (the SDK query() is stateless, "
        "so the conversation is replayed each request).",
    )
