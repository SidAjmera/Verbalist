import type { DebateSession } from '@verbalist/shared-types';
export function debateClock(session: DebateSession, now: number) {
  if (!session.timed || session.status === 'completed')
    return { phase: 'idle' as const, remaining: 0 };
  const elapsed =
    session.clock_started_at && session.status === 'active'
      ? Math.max(0, now - Date.parse(session.clock_started_at))
      : 0;
  const remaining = Math.max(0, session.clock_remaining_ms - elapsed);
  if (remaining === 0 && session.clock_phase === 'preparation')
    return { phase: 'ready' as const, remaining: session.speaking_seconds * 1000 };
  if (remaining === 0 && session.clock_phase === 'speaking')
    return { phase: 'expired' as const, remaining: 0 };
  return { phase: session.clock_phase, remaining };
}
export function clockLabel(milliseconds: number) {
  const seconds = Math.ceil(milliseconds / 1000);
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
