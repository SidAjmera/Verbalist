"""Provider streaming: incomplete output is never a committed debate turn."""

import asyncio
import json
from collections.abc import AsyncIterator

import httpx
from fastapi import HTTPException

from .ai import TextAdapter
from .models import ProviderRequest


def decode_event(provider: str, raw: str) -> tuple[str, bool]:
    if raw == "[DONE]":
        return "", provider in {"local", "compatible"}
    data = json.loads(raw)
    if data.get("error") or data.get("type") in {"error", "response.failed", "response.incomplete"}:
        raise ValueError("Provider error")
    if provider == "openai":
        return (
            data.get("delta", "") if data.get("type") == "response.output_text.delta" else "",
            data.get("type") == "response.completed",
        )
    if provider == "anthropic":
        delta = data.get("delta", {})
        return (
            delta.get("text", "") if delta.get("type") == "text_delta" else "",
            data.get("type") == "message_stop",
        )
    if provider == "gemini":
        candidate = (data.get("candidates") or [{}])[0]
        if candidate.get("finishReason") in {"SAFETY", "RECITATION", "OTHER"}:
            raise ValueError("Blocked output")
        return (
            "".join(
                part.get("text", "")
                for part in candidate.get("content", {}).get("parts", [])
                if not part.get("thought")
            ),
            candidate.get("finishReason") in {"STOP", "MAX_TOKENS"},
        )
    return ((data.get("choices") or [{}])[0].get("delta", {}).get("content") or "", False)


async def stream_text(
    adapter: TextAdapter, config: ProviderRequest, key: str | None, system: str, prompt: str
) -> AsyncIterator[str]:
    url, headers, body = adapter.prepare(config, key, system, prompt, streaming=True)
    if config.provider == "mock":
        text = adapter.mock_response(system, prompt)
        for offset in range(0, len(text), 40):
            await asyncio.sleep(0.01)
            yield text[offset : offset + 40]
        return
    try:
        # A total deadline bounds even a provider that keeps sending tiny chunks.
        async with (
            asyncio.timeout(90),
            httpx.AsyncClient(
                timeout=httpx.Timeout(30, connect=10), follow_redirects=False
            ) as client,
        ):
            async with client.stream("POST", url, headers=headers, json=body) as response:
                if response.status_code != 200:
                    raise HTTPException(
                        502,
                        "The provider rejected streaming. Check credentials, quotas and model access, or use a standard response.",
                    )
                buffer = b""
                size = 0
                characters = 0
                finished = False
                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                    if size > 1_000_000:
                        raise ValueError("Oversized stream")
                    buffer = (buffer + chunk).replace(b"\r\n", b"\n")
                    while b"\n\n" in buffer:
                        event, buffer = buffer.split(b"\n\n", 1)
                        if len(event) > 65536:
                            raise ValueError("Oversized event")
                        raw = "\n".join(
                            line[5:].lstrip().decode("utf8")
                            for line in event.split(b"\n")
                            if line.startswith(b"data:")
                        )
                        if not raw:
                            continue
                        delta, done = decode_event(config.provider, raw)
                        if not isinstance(delta, str):
                            raise ValueError("Unsupported text delta")
                        characters += len(delta)
                        if characters > 8000:
                            raise ValueError("Response too long")
                        if delta:
                            yield delta
                        if done:
                            finished = True
                            break
                    if len(buffer) > 65536:
                        raise ValueError("Oversized event")
                    if finished:
                        break
                if not finished or characters == 0:
                    raise ValueError("Incomplete stream")
    except (httpx.TimeoutException, TimeoutError):
        raise HTTPException(
            504,
            "The streaming response timed out. Your saved turn is safe; retry the opponent response.",
        ) from None
    except httpx.HTTPError:
        raise HTTPException(
            502, "The provider connection was interrupted. No partial AI turn was saved."
        ) from None
    except (ValueError, TypeError, KeyError, IndexError):
        raise HTTPException(
            502,
            "The provider stream was incomplete or unsupported. No partial AI turn was saved; retry or use a standard response.",
        ) from None
