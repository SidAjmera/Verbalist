import base64
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import Settings, get_settings

bearer = HTTPBearer(auto_error=False)


@dataclass(repr=False)
class Identity:
    id: str
    token: str
    email: str
    authenticated_at: str


async def require_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    settings: Settings = Depends(get_settings),
) -> Identity:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(401, "Sign in to continue.")
    if not settings.supabase_url or not settings.supabase_publishable_key:
        raise HTTPException(503, "Supabase is not configured. Follow the setup guide.")
    try:
        async with httpx.AsyncClient(timeout=12, follow_redirects=False) as client:
            response = await client.get(
                settings.supabase_url.rstrip("/") + "/auth/v1/user",
                headers={
                    "apikey": settings.supabase_publishable_key,
                    "Authorization": f"Bearer {credentials.credentials}",
                },
            )
    except httpx.HTTPError:
        raise HTTPException(503, "Authentication is temporarily unavailable.") from None
    if response.status_code in (401, 403, 404):
        raise HTTPException(401, "Your session has expired. Sign in again.")
    if response.status_code != 200:
        raise HTTPException(503, "Authentication is temporarily unavailable.")
    user = response.json()
    if user.get("is_anonymous") or not user.get("email_confirmed_at") or not user.get("id"):
        raise HTTPException(403, "Verify your email before using Verbalist.")
    # Supabase already verified this exact token above. Use its session-specific
    # authentication time; user.last_sign_in_at is shared across devices.
    authenticated_at = ""
    try:
        payload = credentials.credentials.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        if claims.get("sub") != user["id"]:
            raise HTTPException(401, "Invalid session identity.")
        stamps = [
            entry["timestamp"]
            for entry in claims.get("amr", [])
            if isinstance(entry, dict) and isinstance(entry.get("timestamp"), (int, float))
        ]
        if stamps:
            authenticated_at = datetime.fromtimestamp(max(stamps), UTC).isoformat()
    except (ValueError, IndexError, KeyError, TypeError, OverflowError):
        pass  # Basic requests stay usable; sensitive deletion requires fresh AMR.
    return Identity(user["id"], credentials.credentials, user.get("email", ""), authenticated_at)


class Database:
    def __init__(self, identity: Identity, settings: Settings):
        self.identity = identity
        self.settings = settings

    async def request(self, method: str, path: str, *, params=None, data=None) -> Any:
        try:
            async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
                response = await client.request(
                    method,
                    self.settings.supabase_url.rstrip("/") + "/rest/v1/" + path,
                    headers={
                        "apikey": self.settings.supabase_publishable_key,
                        "Authorization": f"Bearer {self.identity.token}",
                        "Prefer": "return=representation",
                    },
                    params=params,
                    json=data,
                )
        except httpx.HTTPError:
            raise HTTPException(
                503,
                "Saved data is temporarily unavailable. Your unsaved text is still in the editor.",
            ) from None
        if response.status_code >= 400:
            try:
                code = response.json().get("code", "")
            except ValueError:
                code = ""
            if code == "PT409" or code == "23505":
                raise HTTPException(
                    409,
                    "This record changed on another device. Reload the saved version before continuing.",
                )
            if code == "PT404":
                raise HTTPException(404, "Debate not found.")
            if code == "PT429":
                raise HTTPException(
                    429, "Practice limit reached. Please wait a minute and try again."
                )
            if code == "PT422" or code == "23514":
                raise HTTPException(422, "This action is not valid for the current debate.")
            if response.status_code in (401, 403) or code == "42501":
                raise HTTPException(403, "You do not have access to this data.")
            raise HTTPException(
                503, "Unable to access saved data. Check database setup and try again."
            )
        return response.json() if response.content else None

    async def rpc(self, name: str, data: dict) -> Any:
        return await self.request("POST", "rpc/" + name, data=data)

    async def all_rows(self, table: str, params: dict | None = None) -> list[dict]:
        rows, offset = [], 0
        while True:
            batch = await self.request(
                "GET",
                table,
                params={**(params or {}), "limit": 500, "offset": offset, "order": "id.asc"},
            )
            rows.extend(batch)
            if len(batch) < 500:
                return rows
            offset += 500


async def get_database(
    identity: Identity = Depends(require_user), settings: Settings = Depends(get_settings)
) -> Database:
    db = Database(identity, settings)
    await db.rpc("consume_budget", {"p_kind": "api"})
    return db
