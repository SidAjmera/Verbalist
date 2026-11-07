import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { MUNDetail } from '@verbalist/shared-types';
import { useMUN } from '@/hooks/use-mun';
const mocks = vi.hoisted(() => ({ api: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  api: mocks.api,
}));
afterEach(() => vi.clearAllMocks());
const initial = {
  committee: { id: 'practice', version: 1, status: 'active', current_ordinal: 0 },
  delegates: [],
  messages: [],
  draft: { draft: 'Saved opening', version: 1 },
} as unknown as MUNDetail;
it('preserves unsaved writing through new room metadata and detects an independent draft conflict', async () => {
  mocks.api.mockResolvedValue(initial);
  const { result, unmount } = renderHook(() => useMUN('practice'));
  await waitFor(() => expect(result.current.detail?.committee.version).toBe(1));
  act(() => result.current.setDraft('My unsaved local revision'));
  const changed = { ...initial, committee: { ...initial.committee, version: 2 } };
  mocks.api.mockResolvedValue(changed);
  await act(async () => {
    await result.current.load();
  });
  expect(result.current.draft).toBe('My unsaved local revision');
  expect(result.current.conflict).toBe(false);
  const external = { ...changed, draft: { draft: 'Saved on a different device', version: 2 } };
  mocks.api.mockResolvedValue(external);
  await act(async () => {
    await result.current.load();
  });
  expect(result.current.conflict).toBe(true);
  expect(result.current.draft).toBe('My unsaved local revision');
  await expect(result.current.flush()).rejects.toThrow('Resolve the draft conflict first.');
  await act(async () => {
    await result.current.recover();
  });
  expect(result.current.draft).toBe('Saved on a different device');
  expect(result.current.conflict).toBe(false);
  unmount();
});
it('does not let an earlier polling request overwrite a committed MUN contribution', async () => {
  mocks.api.mockResolvedValue(initial);
  const { result, unmount } = renderHook(() => useMUN('practice'));
  await waitFor(() => expect(result.current.detail).toBeTruthy());
  let resolve!: (v: MUNDetail) => void;
  mocks.api.mockImplementationOnce(
    () =>
      new Promise<MUNDetail>((done) => {
        resolve = done;
      }),
  );
  let pending!: Promise<MUNDetail | undefined>;
  act(() => {
    pending = result.current.load();
  });
  const committed = {
    ...initial,
    committee: { ...initial.committee, version: 3 },
    draft: { draft: '', version: 2 },
  };
  await act(async () => {
    await result.current.mutate(async () => committed);
  });
  await act(async () => {
    resolve({ ...initial, committee: { ...initial.committee, version: 2 } });
    await pending;
  });
  expect(result.current.detail?.committee.version).toBe(3);
  expect(result.current.draft).toBe('');
  unmount();
});
