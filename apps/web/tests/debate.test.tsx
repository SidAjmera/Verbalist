import { act, renderHook, waitFor } from '@testing-library/react';
import { it, expect, vi, beforeEach } from 'vitest';
import { nextSpeaker, type DebateDetail } from '@verbalist/shared-types';
import { useDebate } from '@/hooks/use-debate';
import { ApiError } from '@/lib/api';
const { mockApi } = vi.hoisted(() => ({ mockApi: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  api: mockApi,
}));
const initial: DebateDetail = {
  session: {
    id: 'debate',
    owner_id: 'alice',
    motion: 'This house would make public transport free.',
    difficulty: 'intermediate',
    persona: 'analyst',
    format_id: 'quick',
    max_turns: 6,
    preparation_seconds: 60,
    speaking_seconds: 120,
    timed: false,
    clock_phase: 'idle',
    clock_remaining_ms: 0,
    clock_started_at: null,
    created_at: '2026-11-07T00:00:00Z',
    updated_at: '2026-11-07T00:00:00Z',
    completed_at: null,
    side: 'proposition',
    status: 'active',
    draft: '',
    draft_version: 0,
    version: 0,
    turn_count: 0,
  },
  turns: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  mockApi.mockResolvedValue(structuredClone(initial));
});
it('proposition starts in either human position', () => {
  expect(nextSpeaker({ side: 'proposition', turn_count: 0 })).toBe('human');
  expect(nextSpeaker({ side: 'opposition', turn_count: 0 })).toBe('ai');
  expect(nextSpeaker({ side: 'proposition', turn_count: 1 })).toBe('ai');
});
it('autosaves typed text with the account draft version', async () => {
  const { result } = renderHook(() => useDebate('debate'));
  await waitFor(() => expect(result.current.detail).not.toBeNull());
  mockApi.mockResolvedValue({ ...initial.session, draft: 'My argument', draft_version: 1 });
  act(() => result.current.setDraft('My argument'));
  await waitFor(() => expect(result.current.saveState).toBe('saved'), { timeout: 2500 });
  expect(mockApi).toHaveBeenLastCalledWith(
    '/v1/debates/debate/draft',
    expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ draft: 'My argument', expected_draft_version: 0 }),
    }),
  );
});
it('preserves local text on cross-device save conflicts', async () => {
  const { result } = renderHook(() => useDebate('debate'));
  await waitFor(() => expect(result.current.detail).not.toBeNull());
  mockApi.mockRejectedValue(new ApiError(409, 'changed'));
  act(() => result.current.setDraft('Unsaved local text'));
  await act(async () => {
    await result.current.flush().catch(() => {});
  });
  expect(result.current.conflict).toBe(true);
  expect(result.current.draft).toBe('Unsaved local text');
  mockApi.mockResolvedValue({
    ...initial,
    session: { ...initial.session, draft: 'Other device', draft_version: 2 },
  });
  await act(async () => {
    await result.current.recover(true);
  });
  expect(result.current.draft).toBe('Unsaved local text');
  expect(result.current.draftVersion.current).toBe(2);
  expect(result.current.conflict).toBe(false);
});
