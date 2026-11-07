import copy
import json
from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from verbalist.config import Settings
from verbalist.database import Database, Identity, get_database
from verbalist.main import create_app
from verbalist.mun import delegate_prompt


@pytest.fixture
def db():
    value = Database(
        Identity(
            str(uuid4()), "test-token", "delegate@example.test", datetime.now(UTC).isoformat()
        ),
        Settings(environment="test", enable_mock_ai=True),
    )
    value.rpc = AsyncMock()
    value.request = AsyncMock()
    return value


@pytest.fixture
def client(db):
    app = create_app()
    app.dependency_overrides[get_database] = lambda: db
    with TestClient(app) as c:
        yield c


def detail():
    return {
        "committee": {
            "version": 3,
            "status": "active",
            "stage": "caucus",
            "current_ordinal": 1,
            "message_count": 3,
            "procedure_version": "mun-practice-v1",
            "agenda": "Finance locally led climate adaptation",
            "topic": "A transparent and predictable grant process",
        },
        "delegates": [
            {
                "id": str(uuid4()),
                "ordinal": i,
                "role": "human" if i == 0 else "ai",
                "country_code": code,
                "country_name": name,
                "brief": "A hypothetical practice brief prioritizing fair and affordable delivery.",
                "sources": [],
            }
            for i, (code, name) in enumerate(
                [("SG", "Singapore"), ("IN", "India"), ("KE", "Kenya")]
            )
        ],
        "messages": [],
        "draft": {"draft": "Private next opening", "version": 1},
    }


def request(version=3):
    return {
        "provider": "mock",
        "model": "mock-debater",
        "expected_version": version,
        "request_id": str(uuid4()),
    }


def test_mun_is_verified_account_only():
    c = TestClient(create_app())
    for path in ["/v1/mun", "/v1/mun/catalog", f"/v1/mun/{uuid4()}"]:
        assert c.get(path).status_code == 401


def test_mun_catalog_is_explicit_about_its_simulation(client):
    value = client.get("/v1/mun/catalog").json()
    assert value["procedure_version"] == "mun-practice-v1"
    assert len(value["countries"]) == 8
    assert "No formal conference rules" in value["procedure"]


def test_creation_rejects_duplicate_countries_private_links_and_injected_owners(client, db):
    d = detail()
    payload = {
        "committee_key": "environment",
        "agenda": d["committee"]["agenda"],
        "delegates": [
            {k: x[k] for k in ["country_code", "brief", "sources"]} for x in d["delegates"]
        ],
    }
    for changed in [
        dict(payload, owner_id=str(uuid4())),
        dict(payload, delegates=[payload["delegates"][0]] * 3),
    ]:
        assert client.post("/v1/mun", json=changed).status_code == 422
    for link in [
        "http://example.com",
        "https://127.0.0.1/internal",
        "https://user:pass@example.com",
        "javascript:alert(1)",
    ]:
        invalid = copy.deepcopy(payload)
        invalid["delegates"][1]["sources"] = [link]
        assert client.post("/v1/mun", json=invalid).status_code == 422
    db.rpc.assert_not_awaited()


@pytest.mark.parametrize(
    "change,code",
    [
        ({"version": 2}, 409),
        ({"status": "paused"}, 422),
        ({"current_ordinal": 0}, 422),
        ({"message_count": 60}, 422),
    ],
)
def test_ai_rejects_stale_paused_human_slots_and_cap_before_model_calls(client, db, change, code):
    value = detail()
    value["committee"].update(change)
    db.rpc.return_value = value
    assert client.post(f"/v1/mun/{uuid4()}/reply", json=request()).status_code == code
    assert db.rpc.await_count == 1


def test_ai_replay_returns_saved_speech_without_key_or_another_generation(client, db):
    value = detail()
    body = request(0)
    value["messages"] = [
        {
            "request_id": body["request_id"],
            "provider": "mock",
            "model": "mock-debater",
            "content": "SIMULATION response",
        }
    ]
    db.rpc.return_value = value
    assert client.post(f"/v1/mun/{uuid4()}/reply", json=body).status_code == 200
    assert db.rpc.await_count == 1
    body["model"] = "other-model"
    assert client.post(f"/v1/mun/{uuid4()}/reply", json=body).status_code == 409


def test_simulation_keeps_country_brief_and_does_not_consume_the_human_draft(client, db):
    value = detail()
    db.rpc.side_effect = [value, None, value]
    assert client.post(f"/v1/mun/{uuid4()}/reply", json=request()).status_code == 200
    name, args = db.rpc.call_args.args
    assert name == "mun_append"
    assert args["p_draft"] is None
    assert "SIMULATION" in args["p_text"] and "India" in args["p_text"]
    assert value["delegates"][1]["brief"] in args["p_text"]
    assert "not verified government policy" in args["p_text"]


def test_prompt_has_pinned_country_identity_and_bounded_historical_context():
    value = detail()
    value["messages"] = [
        {
            "delegate_id": value["delegates"][0]["id"],
            "stage": "caucus",
            "topic": "Funding",
            "content": "A" * 6000,
        }
        for _ in range(60)
    ]
    system, prompt = delegate_prompt(value, value["delegates"][1])
    parsed = json.loads(prompt)
    assert "NOT verified national policy" in system and "untrusted discussion data" in system
    assert parsed["assigned_delegate"]["id"] == value["delegates"][1]["id"]
    assert parsed["delegates"][0]["id"] == value["delegates"][0]["id"]
    assert sum(len(m["content"]) for m in parsed["transcript"]) <= 10000
    assert parsed["omitted_messages"] > 0
    assert parsed["transcript"][0]["partial_excerpt"]


def test_provider_failure_does_not_append_or_clear_a_draft(client, db, monkeypatch):
    value = detail()
    db.rpc.return_value = value
    generation = AsyncMock(side_effect=HTTPException(503, "Model unavailable"))
    monkeypatch.setattr("verbalist.mun.TextAdapter.generate", generation)
    body = request()
    body["provider"] = "openai"
    body["model"] = "test-model"
    response = client.post(
        f"/v1/mun/{uuid4()}/reply", json=body, headers={"X-AI-Key": "fixture-key"}
    )
    assert response.status_code == 503
    assert all(call.args[0] != "mun_append" for call in db.rpc.call_args_list)
    assert value["draft"]["draft"] == "Private next opening"
