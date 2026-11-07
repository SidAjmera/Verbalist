import asyncio
import json
import time
from uuid import UUID

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import ValidationError

from .config import get_settings
from .database import Database, require_user
from .multiplayer_models import RoomAuth, Signal, VoiceState

router = APIRouter()


@router.websocket("/v1/rooms/{room_id}/live")
async def room_live(socket: WebSocket, room_id: UUID):
    settings = get_settings()
    if socket.headers.get("origin") not in settings.web_origins:
        await socket.close(code=4403)
        return
    await socket.accept()
    db = None
    connection = None
    try:
        raw = await asyncio.wait_for(socket.receive_text(), 5)
        if len(raw.encode()) > 12000:
            raise ValueError("frame size")
        auth = RoomAuth.model_validate_json(raw)
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=auth.token)
        identity = await require_user(credentials, settings)
        db = Database(identity, settings)
        connection = str(auth.connection_id)
        await db.rpc("room_connect", {"p_room": str(room_id), "p_connection": connection})
        last_auth = time.monotonic()
        last_tick = 0.0
        cursor = 0
        messages = []
        while True:
            now = time.monotonic()
            if now - last_auth > 30:
                await require_user(credentials, settings)
                last_auth = now
            if now - last_tick >= 1:
                tick = await db.rpc(
                    "room_live_tick",
                    {"p_room": str(room_id), "p_connection": connection, "p_after": cursor},
                )
                await socket.send_json(
                    {"type": "state", "version": tick["version"], "peers": tick["peers"]}
                )
                for signal in tick["signals"]:
                    await socket.send_json({"type": "signal", **signal})
                    cursor = max(cursor, signal["id"])
                last_tick = time.monotonic()
            try:
                raw = await asyncio.wait_for(
                    socket.receive_text(), max(0.05, 1 - (time.monotonic() - last_tick))
                )
            except TimeoutError:
                continue
            if len(raw.encode()) > 16000:
                raise ValueError("frame size")
            messages = [stamp for stamp in messages if now - stamp < 60]
            messages.append(now)
            if len(messages) > 180:
                raise ValueError("message budget")
            frame = json.loads(raw)
            if frame == {"type": "ping"}:
                continue
            if not isinstance(frame, dict):
                raise ValueError("frame type")
            if frame.get("type") == "voice":
                body = VoiceState.model_validate(frame)
                await db.rpc(
                    "room_voice",
                    {"p_room": str(room_id), "p_connection": connection, "p_enabled": body.enabled},
                )
            elif frame.get("type") == "signal":
                body = Signal.model_validate(frame)
                if body.kind == "description":
                    if (
                        set(body.payload) != {"type", "sdp"}
                        or body.payload["type"] not in ("offer", "answer")
                        or not isinstance(body.payload["sdp"], str)
                        or len(body.payload["sdp"]) > 12000
                    ):
                        raise ValueError("SDP")
                elif (
                    set(body.payload) - {"candidate", "sdpMid", "sdpMLineIndex", "usernameFragment"}
                    or not isinstance(body.payload.get("candidate"), str)
                    or len(body.payload["candidate"]) > 2000
                ):
                    raise ValueError("candidate")
                try:
                    await db.rpc(
                        "room_send_signal",
                        {
                            "p_room": str(room_id),
                            "p_connection": connection,
                            "p_target": str(body.target_id),
                            "p_target_connection": str(body.target_connection),
                            "p_kind": body.kind,
                            "p_payload": body.payload,
                        },
                    )
                except HTTPException as error:
                    if error.status_code in (403, 409):
                        await socket.send_json(
                            {
                                "type": "signal_error",
                                "detail": "The peer connection changed. Rejoin audio if needed.",
                            }
                        )
                    else:
                        raise
            else:
                raise ValueError("message type")
    except WebSocketDisconnect:
        pass
    except HTTPException as error:
        try:
            await socket.send_json(
                {
                    "type": "error",
                    "status": error.status_code,
                    "detail": "Room connection unavailable. Membership may have changed; reload to continue.",
                }
            )
            await socket.close(
                code=4409
                if error.status_code == 409
                else 4404
                if error.status_code == 404
                else 4401
                if error.status_code in (401, 403)
                else 1013
            )
        except (RuntimeError, WebSocketDisconnect):
            pass
    except (ValidationError, ValueError, TypeError, KeyError, TimeoutError):
        try:
            await socket.close(code=4400)
        except RuntimeError:
            pass
    except Exception:
        # Never echo SDP, authentication frames, provider keys or raw upstream errors.
        try:
            await socket.close(code=1011)
        except RuntimeError:
            pass
    finally:
        if db and connection:
            try:
                await db.rpc(
                    "room_disconnect", {"p_room": str(room_id), "p_connection": connection}
                )
            except Exception:
                pass
