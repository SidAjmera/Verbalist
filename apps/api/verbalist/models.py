from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

ProviderId = Literal["openai", "anthropic", "gemini", "compatible", "local", "mock"]
Difficulty = Literal["beginner", "intermediate", "advanced"]
Side = Literal["proposition", "opposition"]
Persona = Literal["analyst", "socratic", "challenger"]
Version = Annotated[int, Field(ge=0, le=2_000_000_000)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ProviderRequest(StrictModel):
    provider: ProviderId
    model: str = Field(min_length=1, max_length=160, pattern=r"^[a-zA-Z0-9._:/-]+$")


class MotionRequest(ProviderRequest):
    topic: str = Field(min_length=2, max_length=200)


class CreateDebate(StrictModel):
    motion: str = Field(min_length=10, max_length=600)
    side: Side = "proposition"
    difficulty: Difficulty = "intermediate"
    persona: Persona = "analyst"
    preparation_seconds: int = Field(default=60, ge=0, le=900)
    speaking_seconds: int = Field(default=120, ge=30, le=600)
    timed: bool = False


class HumanTurn(StrictModel):
    content: str = Field(min_length=1, max_length=8000)
    expected_version: Version
    expected_draft_version: Version
    request_id: UUID


class AIResponse(ProviderRequest):
    expected_version: Version


class SaveDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    draft: str = Field(max_length=8000)
    expected_draft_version: Version


class SetStatus(StrictModel):
    status: Literal["active", "paused", "completed"]
    expected_version: Version


class StartSpeaking(StrictModel):
    expected_version: Version


class UpdateProfile(StrictModel):
    display_name: str = Field(min_length=1, max_length=80)
    username: str | None = Field(
        default=None, min_length=3, max_length=30, pattern=r"^[a-zA-Z0-9_]+$"
    )
    avatar_url: str | None = Field(default=None, max_length=1000)
    version: Version

    @field_validator("avatar_url")
    @classmethod
    def safe_avatar(cls, value):
        if value:
            from urllib.parse import urlsplit

            url = urlsplit(value)
            if url.scheme != "https" or not url.hostname or url.username or url.password:
                raise ValueError("Avatar must be an HTTPS image URL")
        return value


class UpdatePreferences(StrictModel):
    theme: Literal["light", "dark", "system"]
    provider: ProviderId
    model: str = Field(max_length=160)
    difficulty: Difficulty
    input_mode: Literal["text", "voice"] = "text"
    output_mode: Literal["text", "voice", "both"] = "text"
    speech_language: str = Field(default="en-US", pattern=r"^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$")
    speech_rate: float = Field(default=1, ge=0.75, le=1.5)
    speech_voice: str = Field(default="", max_length=200)
    version: Version


class DeleteAccount(StrictModel):
    confirmation: Literal["DELETE"]
