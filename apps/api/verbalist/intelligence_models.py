from typing import Literal
from uuid import UUID

from pydantic import Field

from .models import ProviderRequest, StrictModel, Version

Skill = Literal["reasoning", "evidence", "structure", "rebuttal"]
DRILL_IDS = {"mechanism", "evidence", "rebuttal", "weighing", "fallacy"}


class Analyze(ProviderRequest):
    expected_version: Version
    request_id: UUID


class Research(ProviderRequest):
    expected_version: Version
    consent: Literal[True]


class DrillSubmission(ProviderRequest):
    request_id: UUID
    response: str = Field(min_length=40, max_length=4000)


class Reference(StrictModel):
    position: int = Field(ge=0, le=5)
    quote: str = Field(min_length=3, max_length=600)


class Argument(StrictModel):
    key: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,30}$")
    kind: Literal[
        "claim",
        "evidence",
        "reasoning",
        "counterargument",
        "rebuttal",
        "concession",
        "contradiction",
        "unanswered",
        "potential_fallacy",
    ]
    speaker: Literal["human", "ai"]
    text: str = Field(min_length=3, max_length=600)
    explanation: str = Field(min_length=10, max_length=1000)
    confidence: float = Field(ge=0, le=1, strict=True)
    ref: Reference


class ArgumentLink(StrictModel):
    source: str = Field(max_length=30)
    target: str = Field(max_length=30)
    relation: Literal["supports", "rebuts", "contradicts", "concedes", "answers"]
    explanation: str = Field(min_length=10, max_length=1000)
    confidence: float = Field(ge=0, le=1, strict=True)


class Score(StrictModel):
    score: int = Field(ge=0, le=10, strict=True)
    rationale: str = Field(min_length=10, max_length=800)
    ref: Reference


class Scores(StrictModel):
    reasoning: Score
    evidence: Score
    structure: Score
    rebuttal: Score


class Finding(StrictModel):
    text: str = Field(min_length=10, max_length=1000)
    ref: Reference


class Ballot(StrictModel):
    human: Scores
    ai: Scores
    decision: str = Field(min_length=20, max_length=2000)
    clashes: list[Finding] = Field(min_length=1, max_length=5)
    confidence: float = Field(ge=0, le=1, strict=True)
    uncertainty: str = Field(min_length=10, max_length=1000)
    delivery: None = None


class CoachingAction(StrictModel):
    skill: Skill
    explanation: str = Field(min_length=10, max_length=1000)
    rewrite: str = Field(min_length=10, max_length=1000)
    drill_id: Literal["mechanism", "evidence", "rebuttal", "weighing", "fallacy"]
    ref: Reference


class Coach(StrictModel):
    summary: str = Field(min_length=10, max_length=2000)
    strengths: list[Finding] = Field(min_length=1, max_length=5)
    weaknesses: list[Finding] = Field(min_length=1, max_length=5)
    actions: list[CoachingAction] = Field(min_length=1, max_length=4)


class Claim(StrictModel):
    text: str = Field(min_length=5, max_length=600)
    uncertainty: str = Field(min_length=10, max_length=600)
    ref: Reference


class AnalysisOutput(StrictModel):
    summary: str = Field(min_length=10, max_length=2000)
    uncertainty: str = Field(min_length=10, max_length=2000)
    arguments: list[Argument] = Field(min_length=1, max_length=30)
    links: list[ArgumentLink] = Field(max_length=40)
    claims: list[Claim] = Field(max_length=10)
    ballot: Ballot | None
    coach: Coach


class DrillCriterion(StrictModel):
    score: int = Field(ge=0, le=2, strict=True)
    explanation: str = Field(min_length=10, max_length=600)
    quote: str = Field(min_length=3, max_length=600)


class DrillFeedback(StrictModel):
    summary: str = Field(min_length=10, max_length=1200)
    criteria: list[DrillCriterion] = Field(min_length=3, max_length=3)
    improvement: str = Field(min_length=10, max_length=1200)


class ResearchAssessment(StrictModel):
    status: Literal["verified", "disputed", "unverified"]
    explanation: str = Field(min_length=10, max_length=4000)
