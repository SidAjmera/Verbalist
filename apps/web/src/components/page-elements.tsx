import Link from 'next/link';
import { ArrowRight, History, LockKeyhole, RotateCw } from 'lucide-react';
import type { DebateSession } from '@verbalist/shared-types';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { dateLabel } from '@/lib/utils';
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div>
        <p className="eyebrow mb-3">{eyebrow}</p>
        <h1 className="page-title">{title}</h1>
        <p className="subtitle max-w-2xl">{description}</p>
      </div>
      {action}
    </div>
  );
}
export function LoadingState() {
  return (
    <div
      className="flex min-h-48 items-center justify-center gap-3 text-sm text-muted-foreground"
      role="status"
    >
      <RotateCw className="size-4 motion-safe:animate-spin" />
      Connecting to your workspace…
    </div>
  );
}
export function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="notice notice-error" role="alert">
      <p>{message}</p>
      <Button variant="outline" size="sm" className="mt-3 ml-0!" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}
export function EmptyState({
  title = 'Your first debate is a good place to start.',
  description = 'Choose a motion, take a side, and put your reasoning to the test.',
  href = '/arena',
  label = 'Start a debate',
}: {
  title?: string;
  description?: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-5 flex size-12 items-center justify-center rounded-2xl border border-border bg-accent text-primary">
        <History size={22} />
      </span>
      <h3 className="section-title">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
      <Button asChild variant="outline" className="mt-5">
        <Link href={href}>
          {label}
          <ArrowRight />
        </Link>
      </Button>
    </div>
  );
}
export function SessionList({ sessions }: { sessions: DebateSession[] }) {
  return (
    <div className="divide-y divide-border">
      {sessions.map((session) => (
        <Link
          key={session.id}
          href={`/arena/${session.id}`}
          className="group flex items-center gap-4 px-5 py-5 transition-colors hover:bg-accent/50 sm:px-6"
        >
          <span className="hidden size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground sm:flex">
            <History size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-sm font-medium leading-6 group-hover:text-primary">
              {session.motion}
            </h3>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{dateLabel(session.updated_at)}</span>
              <span>Quick Debate</span>
              <span className="capitalize">{session.side}</span>
              <span>
                {session.turn_count}/{session.max_turns} turns
              </span>
            </p>
          </div>
          <span className={`pill shrink-0 ${session.status !== 'completed' ? 'pill-active' : ''}`}>
            {session.status === 'active'
              ? 'In progress'
              : session.status === 'paused'
                ? 'Paused'
                : 'Completed'}
          </span>
          <ArrowRight className="hidden size-4 text-muted-foreground sm:block" />
        </Link>
      ))}
    </div>
  );
}
export function PrivateNote() {
  return (
    <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
      <LockKeyhole size={13} />
      Only you can access these debates.
    </p>
  );
}
export function StatCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs font-medium">{label}</span>
        {icon}
      </div>
      <p className="mt-5 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </Card>
  );
}
