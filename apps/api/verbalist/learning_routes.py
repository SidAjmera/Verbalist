from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException

from .ai import TextAdapter
from .database import Database, get_database
from .intelligence import RUBRIC, analyze, evaluate_drill
from .intelligence_models import Analyze, DrillSubmission, Research
from .research import research_claim

router = APIRouter(prefix="/v1")


@router.get("/rubrics/quick-v1")
async def rubric(db: Database = Depends(get_database)):
    return RUBRIC


@router.get("/debates/{session_id}/analysis")
async def get_analysis(
    session_id: UUID, run_id: UUID | None = None, db: Database = Depends(get_database)
):
    return await db.rpc(
        "analysis_detail", {"p_session": str(session_id), "p_run": str(run_id) if run_id else None}
    )


@router.post("/debates/{session_id}/analysis")
async def create_analysis(
    session_id: UUID,
    body: Analyze,
    x_ai_key: str | None = Header(default=None),
    db: Database = Depends(get_database),
):
    sessions = await db.request(
        "GET",
        "debate_sessions",
        params={"id": f"eq.{session_id}", "owner_id": f"eq.{db.identity.id}", "limit": 1},
    )
    if not sessions:
        raise HTTPException(404, "Debate not found.")
    session = sessions[0]
    if session["version"] != body.expected_version:
        raise HTTPException(409, "The debate changed. Reload before analyzing.")
    existing = await db.request(
        "GET",
        "analysis_runs",
        params={
            "owner_id": f"eq.{db.identity.id}",
            "request_id": f"eq.{body.request_id}",
            "limit": 1,
        },
    )
    if existing:
        if (
            existing[0]["session_id"] != str(session_id)
            or existing[0]["session_version"] != body.expected_version
        ):
            raise HTTPException(409, "This request identifier belongs to a different analysis.")
        return await db.rpc("analysis_detail", {"p_session": str(session_id)})
    turns = await db.request(
        "GET",
        "debate_turns",
        params={"session_id": f"eq.{session_id}", "order": "position.asc", "limit": 100},
    )
    await db.rpc("consume_budget", {"p_kind": "ai"})
    data = await analyze(TextAdapter(db.settings), body, x_ai_key, session, turns)
    await db.rpc(
        "save_analysis",
        {
            "p_session": str(session_id),
            "p_expected": body.expected_version,
            "p_request": str(body.request_id),
            "p_provider": body.provider,
            "p_model": body.model,
            "p_data": data,
        },
    )
    return await db.rpc("analysis_detail", {"p_session": str(session_id)})


@router.post("/claims/{claim_id}/research")
async def check_claim(
    claim_id: UUID,
    body: Research,
    x_ai_key: str | None = Header(default=None),
    db: Database = Depends(get_database),
):
    rows = await db.request(
        "GET",
        "factual_claims",
        params={"id": f"eq.{claim_id}", "owner_id": f"eq.{db.identity.id}", "limit": 1},
    )
    if not rows:
        raise HTTPException(404, "Claim not found.")
    claim = rows[0]
    if claim["version"] != body.expected_version:
        raise HTTPException(409, "The claim changed. Reload before researching.")
    await db.rpc("consume_budget", {"p_kind": "ai"})
    result = await research_claim(TextAdapter(db.settings), body, x_ai_key, claim["data"]["text"])
    await db.rpc(
        "save_research",
        {
            "p_claim": str(claim_id),
            "p_expected": body.expected_version,
            "p_status": result["status"],
            "p_assessment": result["explanation"],
            "p_model": body.model,
            "p_sources": result["sources"],
        },
    )
    return await db.rpc("analysis_detail", {"p_session": claim["session_id"]})


@router.get("/learning/progress")
async def progress(db: Database = Depends(get_database)):
    return await db.rpc("learning_progress", {})


@router.get("/drills")
async def drills(db: Database = Depends(get_database)):
    return await db.request("GET", "practice_drills", params={"order": "id.asc", "limit": 20})


@router.get("/drill-attempts")
async def attempts(db: Database = Depends(get_database)):
    return await db.request(
        "GET",
        "drill_attempts",
        params={
            "owner_id": f"eq.{db.identity.id}",
            "order": "created_at.desc,id.desc",
            "limit": 30,
        },
    )


@router.post("/drills/{drill_id}/attempts")
async def submit_drill(
    drill_id: str,
    body: DrillSubmission,
    x_ai_key: str | None = Header(default=None),
    db: Database = Depends(get_database),
):
    drills = await db.request("GET", "practice_drills", params={"id": f"eq.{drill_id}", "limit": 1})
    if not drills:
        raise HTTPException(404, "Drill not found.")
    existing = await db.request(
        "GET",
        "drill_attempts",
        params={
            "owner_id": f"eq.{db.identity.id}",
            "request_id": f"eq.{body.request_id}",
            "limit": 1,
        },
    )
    if existing:
        if existing[0]["response"] != body.response or existing[0]["drill_id"] != drill_id:
            raise HTTPException(
                409, "This submission identifier was already used for another response."
            )
        return existing[0]
    await db.rpc("consume_budget", {"p_kind": "ai"})
    feedback = await evaluate_drill(
        TextAdapter(db.settings), body, x_ai_key, drills[0], body.response
    )
    return await db.rpc(
        "save_drill_attempt",
        {
            "p_drill": drill_id,
            "p_request": str(body.request_id),
            "p_response": body.response,
            "p_provider": body.provider,
            "p_model": body.model,
            "p_feedback": feedback,
        },
    )
