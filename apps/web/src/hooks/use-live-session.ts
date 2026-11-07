'use client';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
export type ConnectionState =
  'connecting' | 'connected' | 'reconnecting' | 'offline' | 'unavailable';
export function useLiveSession(
  id: string,
  onRevision: (version: number, draftVersion: number) => void,
) {
  const [state, setState] = useState<ConnectionState>('connecting');
  const callback = useRef(onRevision);
  useEffect(() => {
    callback.current = onRevision;
  }, [onRevision]);
  useEffect(() => {
    let disposed = false,
      socket: WebSocket | null = null,
      retry: ReturnType<typeof setTimeout> | undefined,
      attempts = 0,
      stopped = false,
      connecting = false;
    const connect = async () => {
      if (disposed || stopped || connecting || (socket && socket.readyState < 2)) return;
      if (!navigator.onLine) {
        setState('offline');
        return;
      }
      try {
        connecting = true;
        const {
          data: { session },
        } = await createClient().auth.getSession();
        if (disposed || !navigator.onLine) return;
        if (!session) {
          setState('unavailable');
          return;
        }
        const url = new URL(
          `/v1/debates/${id}/live`,
          process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000',
        );
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        const connection = new WebSocket(url);
        socket = connection;
        connection.onopen = () => {
          if (disposed) {
            connection.close();
            return;
          }
          connection.send(JSON.stringify({ type: 'authenticate', token: session.access_token }));
        };
        connection.onmessage = (event) => {
          if (disposed || socket !== connection) return;
          try {
            const data = JSON.parse(String(event.data));
            if (data.type === 'heartbeat' || data.type === 'revision') {
              setState('connected');
              attempts = 0;
            }
            if (
              data.type === 'revision' &&
              Number.isInteger(data.version) &&
              Number.isInteger(data.draft_version)
            )
              callback.current(data.version, data.draft_version);
          } catch {
            connection.close();
          }
        };
        connection.onerror = () => connection.close();
        connection.onclose = (event) => {
          if (disposed || socket !== connection) return;
          socket = null;
          if (event.code === 4403 || event.code === 4404 || event.code === 4400) {
            stopped = true;
            setState('unavailable');
            return;
          }
          setState(navigator.onLine ? 'reconnecting' : 'offline');
          if (!navigator.onLine) return;
          retry = setTimeout(
            () => void connect(),
            Math.min(30000, 1000 * 2 ** Math.min(attempts++, 5)),
          );
        };
      } catch {
        if (!disposed) {
          setState('reconnecting');
          retry = setTimeout(() => void connect(), 5000);
        }
      } finally {
        connecting = false;
      }
    };
    const offline = () => {
      setState('offline');
      clearTimeout(retry);
      socket?.close();
    };
    const online = () => {
      clearTimeout(retry);
      void connect();
    };
    void connect();
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => {
      disposed = true;
      clearTimeout(retry);
      socket?.close();
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
    };
  }, [id]);
  return state;
}
