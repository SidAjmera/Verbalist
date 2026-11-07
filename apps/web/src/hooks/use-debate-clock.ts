'use client';
import { useEffect, useState } from 'react';
import type { DebateSession } from '@verbalist/shared-types';
import { debateClock } from '@/lib/debate-clock';
export function useDebateClock(session: DebateSession | undefined, serverTime?: string) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const offset = serverTime ? Date.parse(serverTime) - Date.now() : 0;
    const tick = () => setNow(Date.now() + offset);
    const timer = setInterval(tick, 200);
    void Promise.resolve().then(tick);
    return () => clearInterval(timer);
  }, [serverTime]);
  return session ? debateClock(session, now) : { phase: 'idle' as const, remaining: 0 };
}
