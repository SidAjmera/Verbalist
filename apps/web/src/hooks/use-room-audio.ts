'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { IceConfiguration, RoomDetail, RoomWireFrame } from '@verbalist/shared-types';
import { api } from '@/lib/api';
import { RoomAudio } from '@/lib/room-audio';
export function useRoomAudio(id: string) {
  const [joined, setJoined] = useState(false),
    [joining, setJoining] = useState(false),
    [message, setMessage] = useState('Audio is off'),
    [blob, setBlob] = useState<Blob | null>(null),
    [url, setUrl] = useState(''),
    [saved, setSaved] = useState(false),
    [record, setRecord] = useState(false),
    [muted, setMuted] = useState(false),
    [relay, setRelay] = useState<boolean | null>(null);
  const controller = useRef<RoomAudio | null>(null),
    objectUrl = useRef(''),
    transport = useRef<{ connection: () => string; send: (v: unknown) => boolean } | null>(null),
    unsaved = useRef(false),
    joiningRef = useRef(false);
  const leave = useCallback(() => {
    controller.current?.leave();
    joiningRef.current = false;
    setJoined(false);
    setJoining(false);
    setRecord(false);
    setMessage('Audio is off. Join again when ready.');
  }, []);
  const receive = useCallback((frame: RoomWireFrame) => controller.current?.frame(frame), []);
  const allowNavigation = useCallback(() => {
    if (unsaved.current || controller.current?.isRecording()) {
      setMessage(
        'Save or discard your own-microphone recording before leaving. Stop audio first if it is recording.',
      );
      return false;
    }
    return true;
  }, []);
  useEffect(() => {
    let mounted = true;
    const c = new RoomAudio(
      () => transport.current?.connection() || '',
      (v) => transport.current?.send(v) || false,
      (message) => {
        if (!mounted) return;
        setMessage(message);
        if (message === 'Audio left') {
          setJoined(false);
          setRecord(false);
        }
      },
      (value) => {
        if (!mounted) return;
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = URL.createObjectURL(value);
        setUrl(objectUrl.current);
        unsaved.current = true;
        setSaved(false);
        setBlob(value);
        setRecord(false);
      },
    );
    controller.current = c;
    const hide = () => {
      if (document.hidden) leave();
    };
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (unsaved.current || c.isRecording()) e.preventDefault();
    };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      mounted = false;
      c.leave();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      controller.current = null;
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [leave]);
  async function join(detail: RoomDetail) {
    if (joiningRef.current || !controller.current) return;
    joiningRef.current = true;
    setJoining(true);
    setMessage('Connecting audio…');
    try {
      const ice = await api<IceConfiguration>(`/v1/rooms/${id}/ice`);
      setRelay(ice.relay_configured);
      if (!joiningRef.current) return;
      const self = detail.members.find((m) => m.user_id === detail.self_id);
      await controller.current.join(
        ice,
        !!self && ['proposition', 'opposition'].includes(self.role),
      );
      if (joiningRef.current) setJoined(true);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Audio could not connect.');
    } finally {
      joiningRef.current = false;
      setJoining(false);
    }
  }
  return {
    joined,
    joining,
    message,
    blob,
    url,
    saved,
    record,
    muted,
    relay,
    controller,
    bindTransport: (value: { connection: () => string; send: (v: unknown) => boolean }) => {
      transport.current = value;
    },
    receive,
    leave,
    join,
    allowNavigation,
    setContext: (detail: RoomDetail, floor: boolean) => controller.current?.setRoom(detail, floor),
    toggleMute: () => {
      setMuted(!muted);
      controller.current?.setMuted(!muted);
    },
    toggleRecord: (value: boolean) => {
      setRecord(value);
      controller.current?.armRecording(value);
    },
    downloaded: () => {
      unsaved.current = false;
      setSaved(true);
    },
    discard: () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = '';
      setUrl('');
      unsaved.current = false;
      setBlob(null);
      setSaved(false);
    },
    play: () => controller.current?.play(),
  };
}
