"""Private revision notifications. No provider keys, audio or transcripts on this socket."""

import asyncio
import json
import time
from uuid import UUID

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPAuthorizationCredentials

from .config import get_settings
from .database import Database, require_user

router = APIRouter()


@router.websocket("/v1/debates/{session_id}/live")
async def session_live(socket: WebSocket, session_id: UUID):
    settings = get_settings()
    if socket.headers.get("origin") not in settings.web_origins:
        await socket.close(code=4403)
        return
    await socket.accept()
    try:
        raw = await asyncio.wait_for(socket.receive_text(), timeout=5)
        if len(raw) > 12000:
            raise ValueError("oversized authentication")
        frame = json.loads(raw)
        if (
            set(frame) != {"type", "token"}
            or frame["type"] != "authenticate"
            or not isinstance(frame["token"], str)
            or len(frame["token"]) > 8192
        ):
            raise ValueError("invalid authentication")
        token = frame.pop("token")
        identity = await require_user(
            HTTPAuthorizationCredentials(scheme="Bearer", credentials=token), settings
        )
        db = Database(identity, settings)
        await db.rpc("consume_budget", {"p_kind": "api"})
        previous = None
        last_auth = time.monotonic()
        last_poll = 0.0
        last_heartbeat = 0.0
        messages = []
        while True:
            now = time.monotonic()
            if now - last_auth > 30:
                await require_user(
                    HTTPAuthorizationCredentials(scheme="Bearer", credentials=token), settings
                )
                last_auth = now
            if now - last_poll >= 2:
                rows = await db.request(
                    "GET",
                    "debate_sessions",
                    params={"id": f"eq.{session_id}", "owner_id": f"eq.{identity.id}", "limit": 1},
                )
                if not rows:
                    raise HTTPException(404, "Debate not found.")
                revision = (rows[0]["version"], rows[0]["draft_version"])
                if revision != previous:
                    await socket.send_json(
                        {"type": "revision", "version": revision[0], "draft_version": revision[1]}
                    )
                    previous = revision
                last_poll = now
            if now - last_heartbeat >= 15:
                await socket.send_json({"type": "heartbeat"})
                last_heartbeat = now
            try:
                message = await asyncio.wait_for(socket.receive_text(), timeout=2)
                messages = [stamp for stamp in messages if now - stamp < 60]
                messages.append(now)
                if (
                    len(message) > 100
                    or len(messages) > 30
                    or json.loads(message) != {"type": "ping"}
                ):
                    raise ValueError("invalid message")
            except TimeoutError:
                pass
    except WebSocketDisconnect:
        return
    except HTTPException as error:
        await socket.send_json(
            {
                "type": "error",
                "status": error.status_code,
                "detail": "Live updates are unavailable. Reconnect or reload your saved debate.",
            }
        )
        await socket.close(
            code=4401
            if error.status_code in {401, 403}
            else 4404
            if error.status_code == 404
            else 1013
        )
    except (TimeoutError, ValueError, TypeError, KeyError):
        await socket.close(code=4400)
    except Exception:
        # Never surface/log inbound auth frames or upstream request exceptions.
        await socket.close(code=1011)
