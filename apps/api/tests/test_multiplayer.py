import base64
import hashlib
import hmac
from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from verbalist.ai import TextAdapter
from verbalist.config import Settings
from verbalist.database import Database, Identity, get_database
from verbalist.main import create_app
from verbalist.multiplayer import generate_ballot
from verbalist.multiplayer_models import BallotRequest


@pytest.fixture
def db():
    value = Database(
        Identity(str(uuid4()), "test-token", "judge@example.test", datetime.now(UTC).isoformat()),
        Settings(environment="test", enable_mock_ai=True),
    )
    value.rpc = AsyncMock()
    value.request = AsyncMock()
    return value


@pytest.fixture
def client(db):
    app = create_app()
    app.dependency_overrides[get_database] = lambda: db
    with TestClient(app) as value:
        yield value


def transcript(db):
    return {
        "room": {
            "id": str(uuid4()),
            "status": "completed",
            "version": 9,
            "motion": "This house supports public transport",
        },
        "members": [{"user_id": db.identity.id, "role": "judge"}],
        "turns": [
            {
                "position": 0,
                "side": "proposition",
                "content": "Reliable buses widen access to jobs and education.",
            },
            {
                "position": 1,
                "side": "opposition",
                "content": "A universal subsidy can crowd out necessary service investment.",
            },
        ],
    }


def test_multiplayer_requires_auth_and_does_not_accept_identity_fields():
    c = TestClient(create_app())
    for path in [
        "/v1/rooms",
        "/v1/tournaments",
        "/v1/leaderboard",
        "/v1/ranking-profile",
        f"/v1/rooms/{uuid4()}/ice",
    ]:
        assert c.get(path).status_code == 401


def test_room_creation_and_invitation_hashing(client, db):
    identifier = str(uuid4())
    db.rpc.side_effect = [
        identifier,
        {"room": {"id": identifier}},
        {"id": str(uuid4()), "role": "opposition"},
    ]
    assert (
        client.post(
            "/v1/rooms", json={"motion": "This house supports public transport", "alias": "Host"}
        ).status_code
        == 200
    )
    value = client.post(f"/v1/rooms/{identifier}/invitations", json={"role": "opposition"}).json()
    assert len(value["code"]) == 43
    args = db.rpc.call_args.args[1]
    assert args["p_hash"] == hashlib.sha256(value["code"].encode()).hexdigest()
    assert value["code"] not in str(args)
    assert (
        client.post(
            "/v1/rooms",
            json={"motion": "A valid motion here", "alias": "Host", "owner_id": str(uuid4())},
        ).status_code
        == 422
    )


def test_invitation_requires_explicit_sharing_consent(client, db):
    for consent in [False, None]:
        response = client.post(
            "/v1/invitations/accept", json={"code": "a" * 43, "alias": "Guest", "consent": consent}
        )
        assert response.status_code == 422
    db.rpc.assert_not_awaited()


def test_ice_authorizes_room_and_issues_expiring_coturn_credentials(client, db, monkeypatch):
    monkeypatch.setattr("verbalist.multiplayer.time.time", lambda: 1000)
    db.settings = Settings(
        environment="test",
        turn_urls=["turn:relay.example.test:3478?transport=udp"],
        turn_shared_secret="operator-shared-secret",
        rtc_relay_only=True,
    )
    value = client.get(f"/v1/rooms/{uuid4()}/ice").json()
    assert value["expires_at"] == 1600 and value["iceTransportPolicy"] == "relay"
    server = value["iceServers"][0]
    assert server["username"] == f"1600:{db.identity.id}"
    expected = base64.b64encode(
        hmac.new(b"operator-shared-secret", server["username"].encode(), hashlib.sha1).digest()
    ).decode()
    assert server["credential"] == expected
    assert "operator-shared-secret" not in str(value)
    db.rpc.assert_awaited_once()
    db.rpc.side_effect = HTTPException(404, "Room not found")
    assert client.get(f"/v1/rooms/{uuid4()}/ice").status_code == 404


@pytest.mark.parametrize(
    "config",
    [
        {"turn_urls": ["turn:relay.test"]},
        {"rtc_relay_only": True},
        {"stun_urls": ["https://not-stun.test"]},
        {"turn_urls": ["turn:user:pass@relay.test"], "turn_shared_secret": "secret"},
    ],
)
def test_invalid_operator_ice_settings_fail_closed(config):
    with pytest.raises(ValueError):
        Settings(**config)


def test_final_result_requires_explicit_human_review(client, db):
    value = {
        "expected_version": 1,
        "request_id": str(uuid4()),
        "winner": "draw",
        "reason": "The argumentation is evenly balanced.",
        "reviewed": False,
    }
    assert client.post(f"/v1/rooms/{uuid4()}/result", json=value).status_code == 422
    db.rpc.assert_not_awaited()


def test_ballot_is_judge_only_and_replay_avoids_model(client, db):
    detail = transcript(db)
    db.rpc.return_value = detail
    db.request.return_value = [{"id": "existing"}]
    body = {
        "provider": "mock",
        "model": "mock-debater",
        "expected_version": 0,
        "request_id": str(uuid4()),
    }
    assert client.post(f"/v1/rooms/{uuid4()}/ballots", json=body).json() == {"id": "existing"}
    assert db.rpc.await_count == 1
    detail["members"][0]["role"] = "proposition"
    assert client.post(f"/v1/rooms/{uuid4()}/ballots", json=body).status_code == 403


@pytest.mark.asyncio
async def test_mock_ballot_has_two_speaker_grounding_and_no_delivery(db):
    detail = transcript(db)
    config = BallotRequest(
        provider="mock", model="mock-debater", expected_version=9, request_id=uuid4()
    )
    value = await generate_ballot(TextAdapter(db.settings), config, None, detail)
    assert value["delivery"] is None
    for i, side in enumerate(["proposition", "opposition"]):
        for score in value[side].values():
            ref = score["ref"]
            assert ref["position"] == i
            assert detail["turns"][i]["content"][ref["start"] : ref["end"]] == ref["quote"]


def test_socket_rejects_origin_and_requires_auth_before_data():
    c = TestClient(create_app())
    url = f"/v1/rooms/{uuid4()}/live"
    with pytest.raises(WebSocketDisconnect) as exc:
        with c.websocket_connect(url, headers={"origin": "https://evil.example"}):
            pass
    assert exc.value.code == 4403
    with c.websocket_connect(url, headers={"origin": "http://127.0.0.1:3000"}) as ws:
        ws.send_json({"type": "ping"})
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
        assert exc.value.code == 4400


def test_socket_fences_connection_and_does_not_echo_invalid_payload(db, monkeypatch):
    monkeypatch.setattr("verbalist.room_socket.require_user", AsyncMock(return_value=db.identity))
    monkeypatch.setattr("verbalist.room_socket.Database", lambda *args: db)

    async def invoke(name, args):
        if name == "room_live_tick":
            return {"version": 7, "peers": [], "signals": []}

    db.rpc.side_effect = invoke
    c = TestClient(create_app())
    room = str(uuid4())
    connection = str(uuid4())
    with c.websocket_connect(
        f"/v1/rooms/{room}/live", headers={"origin": "http://127.0.0.1:3000"}
    ) as ws:
        ws.send_json(
            {"type": "authenticate", "token": "private-test-token", "connection_id": connection}
        )
        assert ws.receive_json() == {"type": "state", "version": 7, "peers": []}
        ws.send_json(
            {
                "type": "signal",
                "target_id": str(uuid4()),
                "target_connection": str(uuid4()),
                "kind": "description",
                "payload": {"type": "offer", "sdp": "private-SDP", "unexpected": "not-permitted"},
            }
        )
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
        assert exc.value.code == 4400
    assert db.rpc.call_args.args == (
        "room_disconnect",
        {"p_room": room, "p_connection": connection},
    )
