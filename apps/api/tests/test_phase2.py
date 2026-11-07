import json
from unittest.mock import AsyncMock
from uuid import uuid4

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from verbalist import realtime
from verbalist.ai import TextAdapter
from verbalist.ai_stream import stream_text
from verbalist.config import Settings
from verbalist.database import Database, Identity, get_database
from verbalist.main import create_app
from verbalist.models import ProviderRequest


@pytest.mark.parametrize(
    "provider,frames",
    [
        (
            "openai",
            [
                {"type": "response.output_text.delta", "delta": "Hello "},
                {"type": "response.output_text.delta", "delta": "world"},
                {"type": "response.completed"},
            ],
        ),
        (
            "anthropic",
            [
                {
                    "type": "content_block_delta",
                    "delta": {"type": "text_delta", "text": "Hello world"},
                },
                {"type": "message_stop"},
            ],
        ),
        (
            "gemini",
            [
                {
                    "candidates": [
                        {"content": {"parts": [{"text": "Hello world"}]}, "finishReason": "STOP"}
                    ]
                }
            ],
        ),
        ("local", [{"choices": [{"delta": {"content": "Hello world"}}]}, "[DONE]"]),
        ("compatible", [{"choices": [{"delta": {"content": "Hello world"}}]}, "[DONE]"]),
    ],
)
async def test_real_stream_protocols_do_not_put_keys_in_urls(monkeypatch, provider, frames):
    actual = httpx.AsyncClient
    requests = []

    def handler(request):
        requests.append(request)
        payload = "".join(
            "data: " + (frame if isinstance(frame, str) else json.dumps(frame)) + "\r\n\r\n"
            for frame in frames
        )
        return httpx.Response(200, content=payload, headers={"Content-Type": "text/event-stream"})

    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: actual(transport=httpx.MockTransport(handler), **kwargs),
    )
    adapter = TextAdapter(
        Settings(
            local_ai_base_url="http://127.0.0.1:11434/v1",
            compatible_ai_base_url="https://example.test/v1",
        )
    )
    result = "".join(
        [
            part
            async for part in stream_text(
                adapter,
                ProviderRequest(provider=provider, model="test-model"),
                "private-key",
                "system",
                "prompt",
            )
        ]
    )
    assert result == "Hello world"
    assert "private-key" not in str(requests[0].url)
    body = json.loads(requests[0].content)
    assert provider == "gemini" or body["stream"] is True


@pytest.mark.parametrize(
    "payload",
    [
        'data: {"type":"response.output_text.delta","delta":"partial"}\n\n',
        'data: {"type":"error","error":{"message":"PRIVATE-SECRET"}}\n\n',
    ],
)
async def test_incomplete_or_failed_streams_are_safe(monkeypatch, payload):
    actual = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: actual(
            transport=httpx.MockTransport(lambda _: httpx.Response(200, content=payload)), **kwargs
        ),
    )
    with pytest.raises(HTTPException) as error:
        _ = [
            part
            async for part in stream_text(
                TextAdapter(Settings()),
                ProviderRequest(provider="openai", model="test"),
                "key",
                "policy",
                "prompt",
            )
        ]
    assert error.value.status_code == 502
    assert "PRIVATE-SECRET" not in error.value.detail


def test_streaming_route_commits_once_after_complete_and_not_on_failure(monkeypatch):
    app = create_app()
    db = Database(
        Identity(str(uuid4()), "token", "test@example.test", ""),
        Settings(environment="test", enable_mock_ai=True),
    )
    session = {
        "id": str(uuid4()),
        "side": "opposition",
        "turn_count": 0,
        "status": "active",
        "version": 0,
        "difficulty": "beginner",
        "persona": "analyst",
        "motion": "This house would improve education.",
        "speaking_seconds": 60,
    }
    db.request = AsyncMock(side_effect=[[session], [], [{**session, "turn_count": 1}], []])
    db.rpc = AsyncMock()
    app.dependency_overrides[get_database] = lambda: db
    with TestClient(app) as client:
        response = client.post(
            f"/v1/debates/{session['id']}/respond/stream",
            json={"provider": "mock", "model": "mock-debater", "expected_version": 0},
        )
    assert response.status_code == 200
    events = [json.loads(frame[6:]) for frame in response.text.strip().split("\n\n")]
    assert events[0]["type"] == "delta"
    assert events[-1]["type"] == "complete"
    assert sum(call.args[0] == "append_turn" for call in db.rpc.call_args_list) == 1

    async def failure(*args):
        yield "uncommitted"
        raise HTTPException(502, "Safe interruption")

    monkeypatch.setattr("verbalist.main.stream_text", failure)
    db.request = AsyncMock(side_effect=[[session], []])
    db.rpc.reset_mock()
    with TestClient(app) as client:
        response = client.post(
            f"/v1/debates/{session['id']}/respond/stream",
            json={"provider": "mock", "model": "mock-debater", "expected_version": 0},
        )
    assert '"type": "error"' in response.text
    assert not any(call.args[0] == "append_turn" for call in db.rpc.call_args_list)

    # Cancellation/disconnection after an upstream delta must not append a turn.
    monkeypatch.setattr("verbalist.main.Request.is_disconnected", AsyncMock(return_value=True))
    db.request = AsyncMock(side_effect=[[session], []])
    db.rpc.reset_mock()
    with TestClient(app) as client:
        response = client.post(
            f"/v1/debates/{session['id']}/respond/stream",
            json={"provider": "mock", "model": "mock-debater", "expected_version": 0},
        )
    assert response.text == ""
    assert not any(call.args[0] == "append_turn" for call in db.rpc.call_args_list)


def test_socket_rejects_foreign_origins_before_acceptance():
    client = TestClient(create_app())
    with pytest.raises(WebSocketDisconnect) as error:
        with client.websocket_connect(
            f"/v1/debates/{uuid4()}/live", headers={"origin": "https://untrusted.example"}
        ):
            pass
    assert error.value.code == 4403


def test_socket_authentication_and_ownership_are_required(monkeypatch):
    identity = Identity(str(uuid4()), "valid-token", "test@example.test", "")
    verify = AsyncMock(return_value=identity)
    db = Database(identity, Settings())
    db.rpc = AsyncMock()
    db.request = AsyncMock(return_value=[])
    monkeypatch.setattr(realtime, "require_user", verify)
    monkeypatch.setattr(realtime, "Database", lambda *args: db)
    client = TestClient(create_app())
    with client.websocket_connect(
        f"/v1/debates/{uuid4()}/live", headers={"origin": "http://127.0.0.1:3000"}
    ) as socket:
        socket.send_json({"type": "authenticate", "token": "valid-token"})
        event = socket.receive_json()
        assert event["type"] == "error"
        assert event["status"] == 404
        assert "valid-token" not in json.dumps(event)
    verify.assert_awaited_once()
    assert db.request.call_args.kwargs["params"]["owner_id"] == f"eq.{identity.id}"


def test_socket_emits_only_revision_metadata_and_rejects_extra_messages(monkeypatch):
    identity = Identity(str(uuid4()), "valid-token", "test@example.test", "")
    db = Database(identity, Settings())
    db.rpc = AsyncMock()
    db.request = AsyncMock(return_value=[{"version": 4, "draft_version": 7}])
    monkeypatch.setattr(realtime, "require_user", AsyncMock(return_value=identity))
    monkeypatch.setattr(realtime, "Database", lambda *args: db)
    with TestClient(create_app()).websocket_connect(
        f"/v1/debates/{uuid4()}/live", headers={"origin": "http://127.0.0.1:3000"}
    ) as socket:
        socket.send_json({"type": "authenticate", "token": "valid-token"})
        assert socket.receive_json() == {"type": "revision", "version": 4, "draft_version": 7}
        assert socket.receive_json() == {"type": "heartbeat"}
        socket.send_json({"type": "append_turn", "content": "forged"})
        with pytest.raises(WebSocketDisconnect) as error:
            socket.receive_json()
        assert error.value.code == 4400
