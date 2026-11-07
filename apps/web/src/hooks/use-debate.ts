'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DebateDetail, DebateSession } from '@verbalist/shared-types';
import { ApiError, api, json } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useLiveSession } from './use-live-session';
export function useDebate(id: string, allowNavigation?: () => boolean) {
  const router = useRouter();
  const [detail, setDetail] = useState<DebateDetail | null>(null),
    [draft, setDraftState] = useState(''),
    [error, setError] = useState(''),
    [conflict, setConflict] = useState(false),
    [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved'>('saved'),
    [busy, setBusy] = useState(false);
  const draftRef = useRef(''),
    saved = useRef(''),
    draftVersion = useRef(0),
    saving = useRef<Promise<void> | null>(null),
    initialized = useRef(false),
    busyRef = useRef(false),
    conflictRef = useRef(false);
  const detailRef = useRef<DebateDetail | null>(null);
  const update = useCallback((value: DebateDetail) => {
    detailRef.current = value;
    setDetail(value);
  }, []);
  const setDraft = useCallback((text: string) => {
    draftRef.current = text;
    setDraftState(text);
    setSaveState('unsaved');
  }, []);
  const markConflict = useCallback(() => {
    conflictRef.current = true;
    setConflict(true);
    setSaveState('unsaved');
    setError(
      'This debate or draft changed on another device. Your local text is preserved below. Choose how to recover before continuing.',
    );
  }, []);
  const load = useCallback(
    () =>
      api<DebateDetail>(`/v1/debates/${id}`).then(
        (value) => {
          if (!initialized.current) {
            initialized.current = true;
            draftRef.current = value.session.draft;
            saved.current = value.session.draft;
            draftVersion.current = value.session.draft_version;
            setDraftState(value.session.draft);
          } else if (draftRef.current === saved.current && !saving.current) {
            draftRef.current = value.session.draft;
            saved.current = value.session.draft;
            draftVersion.current = value.session.draft_version;
            setDraftState(value.session.draft);
          } else if (value.session.draft_version !== draftVersion.current) markConflict();
          update(value);
          setError((current) => (conflictRef.current ? current : ''));
        },
        (e) => {
          setError(e instanceof Error ? e.message : 'Unable to load the saved debate.');
        },
      ),
    [id, markConflict, update],
  );
  useEffect(() => {
    void load();
    const refresh = () => {
      if (
        !busyRef.current &&
        !saving.current &&
        draftRef.current === saved.current &&
        !conflictRef.current
      )
        void load();
    };
    const timer = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [load]);
  const flush = useCallback(async () => {
    if (saving.current) await saving.current;
    if (conflictRef.current) throw new ApiError(409, 'Resolve the draft conflict before saving.');
    if (draftRef.current === saved.current) return;
    const content = draftRef.current;
    const task = (async () => {
      setSaveState('saving');
      try {
        const session = await api<DebateSession>(
          `/v1/debates/${id}/draft`,
          json('PUT', { draft: content, expected_draft_version: draftVersion.current }),
        );
        saved.current = content;
        draftVersion.current = session.draft_version;
        if (detailRef.current) update({ ...detailRef.current, session });
        setSaveState(draftRef.current === content ? 'saved' : 'unsaved');
      } catch (e) {
        setSaveState('unsaved');
        if (e instanceof ApiError && e.status === 409) markConflict();
        else
          setError(
            e instanceof Error
              ? e.message
              : 'Your draft could not be saved. Keep this page open and retry.',
          );
        throw e;
      }
    })();
    saving.current = task;
    try {
      await task;
    } finally {
      saving.current = null;
    }
  }, [id, markConflict, update]);
  const connection = useLiveSession(id, (version, remoteDraftVersion) => {
    const current = detailRef.current?.session;
    if (
      current &&
      !busyRef.current &&
      !saving.current &&
      (current.version !== version || draftVersion.current !== remoteDraftVersion)
    )
      void load();
  });
  useEffect(() => {
    const navigate = async (event: MouseEvent) => {
      const anchor = (event.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
      if (
        !anchor ||
        anchor.target === '_blank' ||
        anchor.hasAttribute('download') ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey
      )
        return;
      const destination = new URL(anchor.href, window.location.href);
      if (
        destination.origin !== window.location.origin ||
        destination.href === window.location.href ||
        (destination.hash && destination.pathname === window.location.pathname)
      )
        return;
      if (allowNavigation && !allowNavigation()) {
        event.preventDefault();
        return;
      }
      if (draftRef.current === saved.current && !saving.current) return;
      event.preventDefault();
      // Keep Link's local click handlers (such as mobile drawer dismissal).
      // Next.js respects defaultPrevented and waits for the explicit push below.
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        await flush();
        router.push(destination.pathname + destination.search + destination.hash);
      } catch {
        /* Keep the editor open when saving fails; flush presents recovery. */
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    };
    document.addEventListener('click', navigate, true);
    return () => document.removeEventListener('click', navigate, true);
  }, [flush, router, allowNavigation]);
  useEffect(() => {
    if (!initialized.current || busy || conflict || draft === saved.current) return;
    const timer = setTimeout(() => void flush().catch(() => {}), 900);
    return () => clearTimeout(timer);
  }, [draft, busy, conflict, flush]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (draftRef.current !== saved.current || saving.current) {
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);
  const accept = useCallback(
    (value: DebateDetail) => {
      update(value);
      draftVersion.current = value.session.draft_version;
      saved.current = value.session.draft;
      draftRef.current = value.session.draft;
      setDraftState(value.session.draft);
      setSaveState('saved');
    },
    [update],
  );
  async function recover(keepLocal: boolean) {
    setBusy(true);
    busyRef.current = true;
    try {
      const value = await api<DebateDetail>(`/v1/debates/${id}`);
      const local = draftRef.current;
      accept(value);
      conflictRef.current = false;
      setConflict(false);
      setError('');
      if (keepLocal && value.session.status !== 'completed') {
        setDraft(local);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recovery failed.');
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  async function mutate(action: () => Promise<DebateDetail>) {
    if (busyRef.current) return;
    setBusy(true);
    busyRef.current = true;
    setError('');
    try {
      await flush();
      const result = await action();
      accept(result);
      return result;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) markConflict();
      else
        setError(e instanceof Error ? e.message : 'This action failed. Your saved debate is safe.');
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  return {
    detail,
    detailRef,
    draft,
    draftRef,
    draftVersion,
    error,
    setError,
    conflict,
    saveState,
    busy,
    load,
    setDraft,
    flush,
    accept,
    recover,
    mutate,
    connection,
  };
}
