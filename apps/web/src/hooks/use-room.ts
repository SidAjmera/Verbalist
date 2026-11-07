'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RoomDetail, RoomPeer, RoomWireFrame, SharedRoom } from '@verbalist/shared-types';
import { api, ApiError, json } from '@/lib/api';
import { useRoomLive } from './use-room-live';
export function roomClock(room: SharedRoom | undefined, now: number) {
  if (!room || !['active', 'paused'].includes(room.status)) return { phase: 'idle', remaining: 0 };
  const elapsed =
    room.status === 'active' && room.clock_started_at
      ? Math.max(0, now - Date.parse(room.clock_started_at))
      : 0;
  const remaining = Math.max(0, room.clock_remaining_ms - elapsed);
  return remaining === 0 && room.clock_phase === 'preparation'
    ? { phase: 'ready', remaining: room.speaking_seconds * 1000 }
    : remaining === 0 && room.clock_phase === 'speaking'
      ? { phase: 'expired', remaining: 0 }
      : { phase: room.clock_phase, remaining };
}
export function useRoom(
  id: string,
  onWire: (frame: RoomWireFrame) => void,
  onLoss: () => void,
  allowNavigation: () => boolean,
) {
  const router = useRouter();
  const [detail, setDetail] = useState<RoomDetail | null>(null),
    [draft, setDraftState] = useState(''),
    [error, setError] = useState(''),
    [conflict, setConflict] = useState(false),
    [busy, setBusy] = useState(false),
    [saveState, setSaveState] = useState('saved'),
    [peers, setPeers] = useState<RoomPeer[]>([]),
    [now, setNow] = useState(Date.now);
  const detailRef = useRef<RoomDetail | null>(null),
    draftRef = useRef(''),
    saved = useRef(''),
    draftVersion = useRef(0),
    initialized = useRef(false),
    busyRef = useRef(false),
    saving = useRef<Promise<void> | null>(null),
    conflictRef = useRef(false);
  const apply = useCallback((value: RoomDetail, force = false) => {
    if (detailRef.current && value.room.version < detailRef.current.room.version) return;
    if (value.draft.version < draftVersion.current) {
      detailRef.current = value;
      setDetail(value);
      return;
    }
    if (!initialized.current || force || draftRef.current === saved.current) {
      initialized.current = true;
      draftRef.current = value.draft.draft;
      saved.current = value.draft.draft;
      draftVersion.current = value.draft.version;
      setDraftState(value.draft.draft);
      setSaveState('saved');
    } else if (value.draft.version !== draftVersion.current) {
      conflictRef.current = true;
      setConflict(true);
      setError(
        'Your private draft changed in another tab. Local text is preserved; reload or copy it before continuing.',
      );
    }
    detailRef.current = value;
    setDetail(value);
  }, []);
  const load = useCallback(async () => {
    try {
      const value = await api<RoomDetail>(`/v1/rooms/${id}`);
      if (!busyRef.current && !saving.current) apply(value);
      return value;
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 404
          ? 'Room not found or membership revoked.'
          : e instanceof Error
            ? e.message
            : 'Unable to load room.',
      );
    }
  }, [id, apply]);
  const onFrame = useCallback(
    (frame: RoomWireFrame) => {
      if (frame.type === 'state') {
        setPeers(frame.peers);
        if (
          detailRef.current &&
          frame.version !== detailRef.current.room.version &&
          !busyRef.current &&
          !saving.current
        )
          void load();
      }
      onWire(frame);
    },
    [load, onWire],
  );
  const live = useRoomLive(id, onFrame, onLoss);
  useEffect(() => {
    queueMicrotask(() => void load());
    const refresh = () => {
      if (!busyRef.current && !saving.current) void load();
    };
    const interval = setInterval(refresh, 5000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  }, [load]);
  useEffect(() => {
    const offset = detail?.server_time ? Date.parse(detail.server_time) - Date.now() : 0;
    const interval = setInterval(() => setNow(Date.now() + offset), 200);
    return () => clearInterval(interval);
  }, [detail?.server_time]);
  const setDraft = useCallback((text: string) => {
    draftRef.current = text;
    setDraftState(text);
    setSaveState('unsaved');
  }, []);
  const flush = useCallback(async () => {
    if (saving.current) await saving.current;
    if (conflictRef.current) throw new ApiError(409, 'Resolve the private draft conflict first.');
    if (draftRef.current === saved.current) return;
    const text = draftRef.current;
    const task = (async () => {
      setSaveState('saving');
      try {
        const value = await api<{ draft: string; version: number }>(
          `/v1/rooms/${id}/draft`,
          json('PUT', { draft: text, expected_version: draftVersion.current }),
        );
        draftVersion.current = value.version;
        saved.current = text;
        setSaveState(draftRef.current === text ? 'saved' : 'unsaved');
      } catch (e) {
        setSaveState('unsaved');
        if (e instanceof ApiError && e.status === 409) {
          conflictRef.current = true;
          setConflict(true);
        }
        setError(e instanceof Error ? e.message : 'Draft not saved.');
        throw e;
      }
    })();
    saving.current = task;
    try {
      await task;
    } finally {
      saving.current = null;
    }
  }, [id]);
  useEffect(() => {
    if (!initialized.current || busy || conflict || draft === saved.current) return;
    const timer = setTimeout(() => void flush().catch(() => {}), 900);
    return () => clearTimeout(timer);
  }, [draft, busy, conflict, flush]);
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (draftRef.current !== saved.current || saving.current) e.preventDefault();
    };
    const navigate = async (e: MouseEvent) => {
      const a = (e.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
      if (
        !a ||
        a.hasAttribute('download') ||
        a.target === '_blank' ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const to = new URL(a.href, location.href);
      if (
        to.origin !== location.origin ||
        to.href === location.href ||
        (to.pathname === location.pathname && to.hash)
      )
        return;
      if (!allowNavigation()) {
        e.preventDefault();
        return;
      }
      if (draftRef.current === saved.current && !saving.current) return;
      e.preventDefault();
      if (busyRef.current) return;
      try {
        await flush();
        router.push(to.pathname + to.search + to.hash);
      } catch {}
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', navigate, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', navigate, true);
    };
  }, [flush, router, allowNavigation]);
  async function mutate(action: () => Promise<RoomDetail>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await flush();
      const value = await action();
      apply(value, true);
      return value;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed. Reload before retrying.');
    } finally {
      busyRef.current = false;
      setBusy(false);
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
    detailRef,
    draft,
    draftRef,
    draftVersion,
    setDraft,
    error,
    setError,
    conflict,
    busy,
    saveState,
    flush,
    load,
    mutate,
    recover,
    live,
    peers,
    clock: roomClock(detail?.room, now),
  };
}
