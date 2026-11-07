import { expect, it, vi, afterEach } from 'vitest';
import { debateClock, clockLabel } from '@/lib/debate-clock';
import type { DebateSession, DebateDetail } from '@verbalist/shared-types';
import { streamOpponent } from '@/lib/stream';
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: 'fixture-token' } } }) },
  }),
}));
afterEach(() => vi.unstubAllGlobals());
const session = {
  timed: true,
  status: 'active',
  clock_phase: 'preparation',
  clock_remaining_ms: 10000,
  clock_started_at: '2026-11-07T00:00:00Z',
  speaking_seconds: 120,
} as DebateSession;
it('derives preparation, speaking expiry and frozen paused time from server timestamps', () => {
  expect(debateClock(session, Date.parse('2026-11-07T00:00:05Z'))).toEqual({
    phase: 'preparation',
    remaining: 5000,
  });
  expect(debateClock(session, Date.parse('2026-11-07T00:00:11Z'))).toEqual({
    phase: 'ready',
    remaining: 120000,
  });
  expect(
    debateClock({ ...session, clock_phase: 'speaking' }, Date.parse('2026-11-07T00:00:11Z')).phase,
  ).toBe('expired');
  expect(
    debateClock({ ...session, status: 'paused' }, Date.parse('2026-11-07T00:01:00Z')).remaining,
  ).toBe(10000);
  expect(clockLabel(1001)).toBe('00:02');
});
function response(events: unknown[]) {
  const bytes = new TextEncoder().encode(
    events.map((event) => 'data: ' + JSON.stringify(event) + '\n\n').join(''),
  );
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.slice(0, 19));
        controller.enqueue(bytes.slice(19));
        controller.close();
      },
    }),
  );
}
it('consumes split stream frames and returns only the committed debate', async () => {
  const debate = { session: { version: 2 }, turns: [] } as unknown as DebateDetail;
  const fetcher = vi.fn().mockResolvedValue(
    response([
      { type: 'delta', text: 'An argument' },
      { type: 'complete', debate },
    ]),
  );
  vi.stubGlobal('fetch', fetcher);
  const delta = vi.fn();
  expect(
    await streamOpponent(
      'id',
      { provider: 'mock', model: 'mock' },
      1,
      'ephemeral',
      delta,
      new AbortController().signal,
    ),
  ).toEqual(debate);
  expect(delta).toHaveBeenCalledWith('An argument');
  expect(fetcher.mock.calls[0][1].headers).toMatchObject({
    'X-AI-Key': 'ephemeral',
    Authorization: 'Bearer fixture-token',
  });
});
it('rejects incomplete output and streamed conflict errors', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(response([{ type: 'delta', text: 'partial' }]))
      .mockResolvedValueOnce(response([{ type: 'error', status: 409, detail: 'changed' }])),
  );
  await expect(
    streamOpponent(
      'id',
      { provider: 'mock', model: 'mock' },
      1,
      '',
      vi.fn(),
      new AbortController().signal,
    ),
  ).rejects.toThrow('before the response was saved');
  await expect(
    streamOpponent(
      'id',
      { provider: 'mock', model: 'mock' },
      1,
      '',
      vi.fn(),
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ status: 409, message: 'changed' });
});
