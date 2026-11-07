'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomWireFrame } from '@verbalist/shared-types';
import { createClient } from '@/lib/supabase/client';
export function useRoomLive(
  id: string,
  onFrame: (frame: RoomWireFrame) => void,
  onLoss: () => void,
) {
  const [state, setState] = useState<
    'connecting' | 'connected' | 'reconnecting' | 'offline' | 'unavailable'
  >('connecting');
  const connection = useRef(''),
    socket = useRef<WebSocket | null>(null),
    frameCallback = useRef(onFrame),
    lossCallback = useRef(onLoss);
  useEffect(() => {
    frameCallback.current = onFrame;
    lossCallback.current = onLoss;
  }, [onFrame, onLoss]);
  useEffect(() => {
    let disposed = false,
      stopped = false,
      opening = false,
      attempt = 0,
      timer: ReturnType<typeof setTimeout> | undefined;
    const connect = async () => {
      if (disposed || stopped || opening || (socket.current && socket.current.readyState < 2))
        return;
      if (!navigator.onLine) {
        setState('offline');
        return;
      }
      opening = true;
      try {
        const {
          data: { session },
        } = await createClient().auth.getSession();
        if (disposed || !navigator.onLine) return;
        if (!session) {
          setState('unavailable');
          return;
        }
        const url = new URL(
          `/v1/rooms/${id}/live`,
          process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000',
        );
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(url);
        socket.current = ws;
        connection.current = crypto.randomUUID();
        const own = connection.current;
        ws.onopen = () => {
          if (disposed) {
            ws.close();
            return;
          }
          ws.send(
            JSON.stringify({
              type: 'authenticate',
              token: session.access_token,
              connection_id: own,
            }),
          );
        };
        ws.onmessage = (event) => {
          if (disposed || socket.current !== ws) return;
          try {
            const frame = JSON.parse(String(event.data)) as RoomWireFrame;
            if (frame.type === 'state') {
              setState('connected');
              attempt = 0;
            }
            frameCallback.current(frame);
          } catch {
            ws.close();
          }
        };
        ws.onerror = () => ws.close();
        ws.onclose = (event) => {
          if (disposed || socket.current !== ws) return;
          socket.current = null;
          lossCallback.current();
          if ([4400, 4403, 4404, 4409].includes(event.code)) {
            stopped = true;
            setState('unavailable');
            return;
          }
          setState(navigator.onLine ? 'reconnecting' : 'offline');
          if (navigator.onLine)
            timer = setTimeout(
              () => void connect(),
              Math.min(30000, 1000 * 2 ** Math.min(attempt++, 5)),
            );
        };
      } catch {
        if (!disposed) {
          setState('reconnecting');
          timer = setTimeout(() => void connect(), 5000);
        }
      } finally {
        opening = false;
      }
    };
    const offline = () => {
      clearTimeout(timer);
      setState('offline');
      lossCallback.current();
      socket.current?.close();
    };
    const online = () => {
      clearTimeout(timer);
      void connect();
    };
    void connect();
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => {
      disposed = true;
      clearTimeout(timer);
      socket.current?.close();
      socket.current = null;
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
    };
  }, [id]);
  const send = useCallback((value: unknown) => {
    if (socket.current?.readyState !== WebSocket.OPEN) return false;
    socket.current.send(JSON.stringify(value));
    return true;
  }, []);
  return { state, connection, send };
}
