import copy
import json
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from verbalist.ai import TextAdapter
from verbalist.config import Settings
from verbalist.database import Database, Identity, get_database
from verbalist.intelligence import (
    analyze,
    evaluate_drill,
    ground_analysis,
    mock_analysis,
    parse_output,
)
from verbalist.intelligence_models import AnalysisOutput, ProviderRequest
from verbalist.main import create_app
from verbalist.research import grounded_research, public_https, research_claim

SESSION = {
    "id": str(uuid4()),
    "status": "completed",
    "version": 3,
    "side": "proposition",
    "motion": "This house would fund public transport.",
}
TURNS = [
    {
        "position": 0,
        "speaker": "human",
        "content": "🚆 Public transport could broaden employment access if reliable.",
    },
    {
        "position": 1,
        "speaker": "ai",
        "content": "Targeted subsidies may reach those in need at lower cost.",
    },
]


def output():
    return parse_output(json.dumps(mock_analysis(SESSION, TURNS)), AnalysisOutput)


def test_unicode_grounding_and_separate_transcript_rubric_no_delivery():
    value = ground_analysis(output(), SESSION, TURNS)
    ref = value["arguments"][0]["ref"]
    assert TURNS[0]["content"][ref["start"] : ref["end"]] == ref["quote"]
    assert value["ballot"]["delivery"] is None
    assert value["coach"]["actions"][0]["drill_id"] == "mechanism"


@pytest.mark.parametrize(
    "mutation", ["quote", "speaker", "edge", "duplicate", "phase", "score_speaker"]
)
def test_rejects_ungrounded_or_inconsistent_analysis(mutation):
    data = output()
    if mutation == "quote":
        data["arguments"][0]["ref"]["quote"] = "Invented words"
    elif mutation == "speaker":
        data["arguments"][0]["speaker"] = "ai"
    elif mutation == "edge":
        data["links"][0]["source"] = "missing"
    elif mutation == "duplicate":
        data["arguments"].append(copy.deepcopy(data["arguments"][0]))
    elif mutation == "phase":
        data["ballot"] = None
    else:
        data["ballot"]["human"]["reasoning"]["ref"] = copy.deepcopy(data["arguments"][1]["ref"])
    with pytest.raises(HTTPException) as error:
        ground_analysis(data, SESSION, TURNS)
    assert error.value.status_code == 502


@pytest.mark.parametrize("raw", ["not JSON", '{"api_key":"PRIVATE"}', '{"score":NaN}'])
def test_invalid_json_errors_do_not_echo_provider_content(raw):
    with pytest.raises(HTTPException) as error:
        parse_output(raw, AnalysisOutput)
    assert "PRIVATE" not in error.value.detail


async def test_simulated_feedback_is_explicit_and_mock_is_prohibited_in_production():
    config = ProviderRequest(provider="mock", model="fixture")
    result = await analyze(
        TextAdapter(Settings(environment="test", enable_mock_ai=True)), config, None, SESSION, TURNS
    )
    assert "SIMULATION" in result["summary"]
    with pytest.raises(HTTPException):
        await analyze(
            TextAdapter(
                Settings(
                    environment="production",
                    supabase_url="https://example.test",
                    web_origins=["https://example.test"],
                )
            ),
            config,
            None,
            SESSION,
            TURNS,
        )


@pytest.mark.parametrize(
    "url",
    [
        "javascript:alert(1)",
        "http://example.org",
        "https://localhost",
        "https://127.0.0.1",
        "https://10.0.0.1/x",
        "https://user:secret@example.org",
        "https://example.org:8000",
        "https://example.org/\nsecret",
    ],
)
def test_research_rejects_unsafe_citations(url):
    assert not public_https(url)


def research_output(citations=True, searched=True):
    return {
        "status": "completed",
        "output": ([{"type": "web_search_call", "status": "completed"}] if searched else [])
        + [
            {
                "type": "message",
                "content": [
                    {
                        "type": "output_text",
                        "text": json.dumps(
                            {
                                "status": "verified",
                                "explanation": "The cited source supports this carefully scoped claim.",
                            }
                        ),
                        "annotations": [
                            {
                                "type": "url_citation",
                                "url": "https://example.org/source",
                                "title": "Primary source",
                            }
                        ]
                        if citations
                        else [],
                    }
                ],
            }
        ],
    }


def test_only_native_search_citations_allow_a_verified_or_disputed_label():
    assert grounded_research(research_output())["status"] == "verified"
    assert grounded_research(research_output(False))["status"] == "unverified"
    assert grounded_research(research_output(searched=False))["sources"] == []
    value = research_output()
    value["output"][1]["content"][0]["annotations"][0]["url"] = "https://127.0.0.1"
    assert grounded_research(value)["status"] == "unverified"


async def test_research_uses_request_header_key_no_storage_and_optional_native_tool(monkeypatch):
    actual = httpx.AsyncClient
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(200, json=research_output())

    monkeypatch.setattr(
        httpx, "AsyncClient", lambda **kw: actual(transport=httpx.MockTransport(handler), **kw)
    )
    result = await research_claim(
        TextAdapter(Settings()),
        ProviderRequest(provider="openai", model="fixture"),
        "ephemeral-key",
        "A scoped claim",
    )
    assert result["sources"][0]["url"] == "https://example.org/source"
    body = json.loads(requests[0].content)
    assert body["store"] is False and body["tools"] == [{"type": "web_search"}]
    assert (
        "ephemeral-key" not in str(requests[0].url)
        and requests[0].headers["Authorization"] == "Bearer ephemeral-key"
    )
    with pytest.raises(HTTPException) as error:
        await research_claim(
            TextAdapter(Settings()),
            ProviderRequest(provider="local", model="fixture"),
            None,
            "claim",
        )
    assert error.value.status_code == 422


def test_analysis_route_uses_owner_and_snapshot_version_before_generation(monkeypatch):
    db = Database(
        Identity(str(uuid4()), "token", "test@example.test", ""),
        Settings(environment="test", enable_mock_ai=True),
    )
    db.request = AsyncMock(side_effect=[[SESSION], [], TURNS])
    db.rpc = AsyncMock(side_effect=[None, str(uuid4()), {"run": {"session_version": 3}}])
    app = create_app()
    app.dependency_overrides[get_database] = lambda: db
    with TestClient(app) as client:
        response = client.post(
            f"/v1/debates/{SESSION['id']}/analysis",
            json={
                "provider": "mock",
                "model": "fixture",
                "expected_version": 3,
                "request_id": str(uuid4()),
            },
        )
    assert response.status_code == 200
    assert db.request.call_args_list[0].kwargs["params"]["owner_id"] == f"eq.{db.identity.id}"
    save = next(call for call in db.rpc.call_args_list if call.args[0] == "save_analysis")
    assert save.args[1]["p_expected"] == 3 and "SIMULATION" in save.args[1]["p_data"]["summary"]
    db.request = AsyncMock(return_value=[{**SESSION, "version": 4}])
    db.rpc.reset_mock()
    with TestClient(app) as client:
        response = client.post(
            f"/v1/debates/{SESSION['id']}/analysis",
            json={
                "provider": "mock",
                "model": "fixture",
                "expected_version": 3,
                "request_id": str(uuid4()),
            },
        )
    assert response.status_code == 409 and not db.rpc.called


async def test_drill_feedback_must_quote_the_actual_response(monkeypatch):
    adapter = TextAdapter(Settings())
    adapter.generate = AsyncMock(
        return_value=json.dumps(
            {
                "summary": "A helpful response with room for improvement.",
                "criteria": [
                    {
                        "score": 1,
                        "explanation": "This is only partially explained.",
                        "quote": "invented",
                    }
                ]
                * 3,
                "improvement": "Add a clear assumption and compare alternatives.",
            }
        )
    )
    with pytest.raises(HTTPException) as error:
        await evaluate_drill(
            adapter,
            ProviderRequest(provider="openai", model="fixture"),
            "key",
            {},
            "This response contains no matching quote at all.",
        )
    assert error.value.status_code == 502
