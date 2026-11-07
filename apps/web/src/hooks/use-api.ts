'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
export function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const revision = useRef(0);
  const invalidate = useCallback(() => {
    revision.current++;
  }, []);
  const reload = useCallback(() => {
    const started = ++revision.current;
    return api<T>(path).then(
      (value) => {
        if (started !== revision.current) return;
        setData(value);
        setError('');
        setLoading(false);
      },
      (error) => {
        if (started !== revision.current) return;
        setError(error instanceof Error ? error.message : 'Unable to load this page.');
        setLoading(false);
      },
    );
  }, [path]);
  useEffect(() => {
    void reload();
    return invalidate;
  }, [reload, invalidate]);
  const replace = useCallback(
    (value: T) => {
      invalidate();
      setData(value);
      setError('');
      setLoading(false);
    },
    [invalidate],
  );
  return { data, error, loading, reload, replace, invalidate };
}
