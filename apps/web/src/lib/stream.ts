import type { DebateDetail, ProviderConfig } from '@verbalist/shared-types';
import { createClient } from './supabase/client';
import { ApiError } from './api';

export async function streamOpponent(
  id: string,
  config: ProviderConfig,
  version: number,
  key: string,
  onDelta: (text: string) => void,
  signal: AbortSignal,
): Promise<DebateDetail> {
  const {
    data: { session },
  } = await createClient().auth.getSession();
  if (!session) throw new ApiError(401, 'Sign in again to continue.');
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'}/v1/debates/${id}/respond/stream`,
    {
      method: 'POST',
      signal,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        ...(key ? { 'X-AI-Key': key } : {}),
      },
      body: JSON.stringify({ ...config, expected_version: version }),
    },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      error?.detail || 'The streaming request failed. Try a standard response.',
    );
  }
  if (!response.body)
    throw new ApiError(502, 'Streaming is unavailable in this browser. Use a standard response.');
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = '',
    total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > 1_000_000) throw new ApiError(502, 'The response exceeded its safe size limit.');
      buffer += decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const raw = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (!raw) continue;
        const event = JSON.parse(raw) as {
          type: string;
          text?: string;
          status?: number;
          detail?: string;
          debate?: DebateDetail;
        };
        if (event.type === 'delta' && typeof event.text === 'string') onDelta(event.text);
        if (event.type === 'error')
          throw new ApiError(
            event.status || 502,
            event.detail || 'Response interrupted. Reload before retrying.',
          );
        if (event.type === 'complete' && event.debate) {
          await reader.cancel();
          return event.debate;
        }
      }
    }
    throw new ApiError(
      502,
      'Connection interrupted before the response was saved. Reload the saved debate before retrying.',
    );
  } finally {
    reader.releaseLock();
  }
}
