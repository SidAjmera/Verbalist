'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MUNDetail } from '@verbalist/shared-types';
import { api, ApiError, json } from '@/lib/api';
export function useMUN(id: string) {
  const router = useRouter();
  const [detail, setDetail] = useState<MUNDetail | null>(null),
    [draft, setText] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [conflict, setConflict] = useState(false),
    [saveState, setSaveState] = useState('saved');
  const current = useRef<MUNDetail | null>(null),
    text = useRef(''),
    saved = useRef(''),
    draftVersion = useRef(0),
    reads = useRef(0),
    busyRef = useRef(false),
    conflictRef = useRef(false),
    pending = useRef<Promise<void> | null>(null),
    disposed = useRef(false);
  const apply = useCallback((value: MUNDetail, force = false) => {
    if (
      disposed.current ||
      (current.current && value.committee.version < current.current.committee.version)
    )
      return;
    if (value.draft.version >= draftVersion.current) {
      if (force || text.current === saved.current) {
        text.current = value.draft.draft;
        saved.current = value.draft.draft;
        draftVersion.current = value.draft.version;
        setText(value.draft.draft);
        setSaveState('saved');
      } else if (value.draft.version !== draftVersion.current) {
        conflictRef.current = true;
        setConflict(true);
        setError(
          'This draft changed in another tab. Copy your local text before loading the saved draft.',
        );
      }
    }
    current.current = value;
    setDetail(value);
  }, []);
  const load = useCallback(async () => {
    const ticket = ++reads.current;
    try {
      const value = await api<MUNDetail>(`/v1/mun/${id}`);
      if (ticket === reads.current && !busyRef.current && !pending.current) apply(value);
      return value;
    } catch (e) {
      if (!disposed.current)
        setError(e instanceof Error ? e.message : 'Unable to load MUN practice.');
    }
  }, [id, apply]);
  const invalidate = useCallback(() => {
    reads.current++;
  }, []);
  useEffect(() => {
    disposed.current = false;
    queueMicrotask(() => void load());
    const refresh = () => {
      if (!busyRef.current && !pending.current) void load();
    };
    const timer = setInterval(refresh, 5000);
    window.addEventListener('focus', refresh);
    return () => {
      disposed.current = true;
      invalidate();
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [load, invalidate]);
  const setDraft = useCallback((value: string) => {
    text.current = value;
    setText(value);
    setSaveState('unsaved');
  }, []);
  const flush = useCallback(async () => {
    if (pending.current) await pending.current;
    if (conflictRef.current) throw Error('Resolve the draft conflict first.');
    if (text.current === saved.current) return;
    const content = text.current;
    const task = (async () => {
      setSaveState('saving');
      try {
        const value = await api<{ draft: string; version: number }>(
          `/v1/mun/${id}/draft`,
          json('PUT', { draft: content, expected_version: draftVersion.current }),
        );
        draftVersion.current = value.version;
        saved.current = content;
        if (!disposed.current) setSaveState(text.current === content ? 'saved' : 'unsaved');
      } catch (e) {
        if (!disposed.current) {
          setSaveState('unsaved');
          if (e instanceof ApiError && e.status === 409) {
            conflictRef.current = true;
            setConflict(true);
          }
          setError(e instanceof Error ? e.message : 'Draft not saved.');
        }
        throw e;
      }
    })();
    pending.current = task;
    try {
      await task;
    } finally {
      pending.current = null;
    }
  }, [id]);
  useEffect(() => {
    if (!current.current || busy || conflict || text.current === saved.current) return;
    const timer = setTimeout(() => void flush().catch(() => {}), 900);
    return () => clearTimeout(timer);
  }, [draft, busy, conflict, flush]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (text.current !== saved.current || pending.current) event.preventDefault();
    };
    const navigate = async (event: MouseEvent) => {
      const link = (event.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
      if (
        !link ||
        link.target === '_blank' ||
        link.hasAttribute('download') ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const destination = new URL(link.href, location.href);
      if (
        destination.origin !== location.origin ||
        destination.href === location.href ||
        (destination.pathname === location.pathname && destination.hash)
      )
        return;
      if (text.current === saved.current && !pending.current) return;
      event.preventDefault();
      if (busyRef.current) return;
      try {
        await flush();
        router.push(destination.pathname + destination.search + destination.hash);
      } catch {}
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', navigate, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', navigate, true);
    };
  }, [flush, router]);
  async function mutate(action: () => Promise<MUNDetail>) {
    if (busyRef.current) return;
    reads.current++;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await flush();
      const value = await action();
      apply(value, true);
      return value;
    } catch (e) {
      if (!disposed.current)
        setError(e instanceof Error ? e.message : 'Action failed. Your saved record is retained.');
    } finally {
      busyRef.current = false;
      if (!disposed.current) setBusy(false);
    }
  }
  async function recover() {
    const value = await load();
    if (value) {
      conflictRef.current = false;
      setConflict(false);
      setError('');
      apply(value, true);
    }
  }
  return {
    detail,
    current,
    draft,
    text,
    draftVersion,
    setDraft,
    error,
    busy,
    conflict,
    saveState,
    load,
    flush,
    mutate,
    recover,
  };
}
