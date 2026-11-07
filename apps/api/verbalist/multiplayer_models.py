from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, Field

from .intelligence_models import Finding, Scores
from .models import ProviderRequest, StrictModel, Version


class RoomSetup(StrictModel):
    motion: str = Field(min_length=10, max_length=600)
    alias: str = Field(min_length=2, max_length=40)
    preparation_seconds: int = Field(default=60, ge=0, le=900)
    speaking_seconds: int = Field(default=120, ge=30, le=600)


class CreateRoom(RoomSetup):
    role: Literal["proposition", "judge"] = "proposition"


class CreateTournament(RoomSetup):
    title: str = Field(min_length=3, max_length=100)
    capacity: Literal[2, 4, 8] = 4


class Invitation(StrictModel):
    role: Literal["proposition", "opposition", "judge", "spectator", "entrant"]
    minutes: int = Field(default=1440, ge=5, le=1440)


class AcceptInvitation(StrictModel):
    code: str = Field(pattern=r"^[A-Za-z0-9_-]{43}$")
    alias: str = Field(min_length=2, max_length=40)
    consent: Literal[True]


class CommandData(StrictModel):
    reason: str = Field(default="", max_length=2000)
    ready: bool | None = None
    ranking_consent: bool | None = None
    user_id: UUID | None = None
    muted: bool | None = None
    invite_id: UUID | None = None
    match_id: UUID | None = None
    scheduled_at: AwareDatetime | None = None


class RoomCommand(StrictModel):
    expected_version: Version
    action: Literal[
        "ready",
        "start",
        "speak",
        "pause",
        "resume",
        "finish",
        "cancel",
        "mute",
        "remove",
        "revoke_invite",
        "concede",
    ]
    data: CommandData = Field(default_factory=CommandData)


class TournamentCommand(StrictModel):
    expected_version: Version
    action: Literal["seed", "schedule", "cancel", "revoke_invite"]
    data: CommandData = Field(default_factory=CommandData)


class RoomDraft(StrictModel):
    expected_version: Version
    draft: str = Field(max_length=8000)


class RoomTurn(StrictModel):
    expected_version: Version
    expected_draft_version: Version
    request_id: UUID
    content: str = Field(min_length=1, max_length=8000)


class BallotRequest(ProviderRequest):
    expected_version: Version
    request_id: UUID


class SharedBallot(StrictModel):
    proposition: Scores
    opposition: Scores
    decision: str = Field(min_length=20, max_length=2000)
    clashes: list[Finding] = Field(min_length=1, max_length=5)
    confidence: float = Field(ge=0, le=1, strict=True)
    uncertainty: str = Field(min_length=10, max_length=1000)
    delivery: None = None


class ConfirmResult(StrictModel):
    expected_version: Version
    request_id: UUID
    winner: Literal["proposition", "opposition", "draw"]
    reason: str = Field(min_length=10, max_length=2000)
    basis: Literal["manual", "ai_assisted"] = "manual"
    ballot_id: UUID | None = None
    reviewed: Literal[True]


class RankingProfile(StrictModel):
    expected_version: Version
    handle: str = Field(pattern=r"^[A-Za-z0-9_]{3,30}$")
    opted_in: bool


class RoomAuth(StrictModel):
    type: Literal["authenticate"]
    token: str = Field(min_length=1, max_length=8192)
    connection_id: UUID


class Signal(StrictModel):
    type: Literal["signal"]
    target_id: UUID
    target_connection: UUID
    kind: Literal["description", "candidate"]
    payload: dict


class VoiceState(StrictModel):
    type: Literal["voice"]
    enabled: bool
