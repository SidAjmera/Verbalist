import { Clock3, Play } from 'lucide-react';
import { clockLabel } from '@/lib/debate-clock';
import { Card } from './ui/card';
import { Button } from './ui/button';
export function DebateTimer({
  phase,
  remaining,
  paused,
  canStart,
  onStart,
}: {
  phase: string;
  remaining: number;
  paused: boolean;
  canStart: boolean;
  onStart: () => void;
}) {
  return (
    <Card className="mb-5 border-primary/25 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow flex items-center gap-2">
            <Clock3 size={13} />
            {phase === 'preparation'
              ? 'PREPARATION'
              : phase === 'ready'
                ? 'READY WHEN YOU ARE'
                : phase === 'speaking'
                  ? 'SPEAKING TIME'
                  : phase === 'expired'
                    ? 'TIME REACHED'
                    : 'OPPONENT TURN'}
            {paused ? ' · PAUSED' : ''}
          </p>
          <p
            className={`mt-2 font-mono text-3xl tracking-tight ${phase === 'expired' ? 'text-amber-500' : 'text-primary'}`}
            role="timer"
            aria-label="Debate countdown"
          >
            {clockLabel(remaining)}
          </p>
        </div>
        {canStart && (
          <Button onClick={onStart} disabled={paused}>
            <Play />
            {phase === 'preparation' ? 'Skip prep & start speaking' : 'Start speaking time'}
          </Button>
        )}
      </div>
      <p className="mt-3 text-xs leading-6 text-muted-foreground">
        {phase === 'expired'
          ? 'Microphone capture stops at the allowance. Review your transcript, then submit when ready.'
          : phase === 'preparation'
            ? 'Prepare your case. The speaking clock starts only when you choose to begin.'
            : phase === 'idle'
              ? 'The opponent’s saved response starts your next preparation period.'
              : 'Your practice clock is saved and synchronized across devices.'}
      </p>
    </Card>
  );
}
