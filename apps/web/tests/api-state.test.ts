import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useApi } from '@/hooks/use-api';
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: mocks.api }));
it('does not let an older read overwrite a freshly committed result', async () => {
  let resolve!: (value: { version: number }) => void;
  mocks.api.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const { result } = renderHook(() => useApi<{ version: number }>('/analysis'));
  act(() => result.current.replace({ version: 2 }));
  await act(async () => {
    resolve({ version: 1 });
  });
  expect(result.current.data).toEqual({ version: 2 });
});
