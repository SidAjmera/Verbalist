'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Tournament, TournamentDetail } from '@verbalist/shared-types';
import { useApi } from '@/hooks/use-api';
import { api, json } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader, ErrorState, LoadingState } from '@/components/page-elements';
import { TimingFields, JoinInvitation } from '@/components/multiplayer-common';
export default function Tournaments() {
  const router = useRouter();
  const [offset, setOffset] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const events = useApi<Tournament[]>(`/v1/tournaments?offset=${offset}`);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      const value = await api<TournamentDetail>(
        '/v1/tournaments',
        json('POST', {
          title: f.get('title'),
          motion: f.get('motion'),
          alias: f.get('alias'),
          capacity: Number(f.get('capacity')),
          preparation_seconds: Number(f.get('preparation_seconds')),
          speaking_seconds: Number(f.get('speaking_seconds')),
        }),
      );
      router.push(`/tournaments/${value.tournament.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create tournament.');
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="A SMALL EVENT. A SHARED CHALLENGE."
        title="Private tournaments"
        description="Invite 2, 4 or 8 players. Run a single-elimination bracket with human-reviewed advancement."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <h2 className="section-title">Organize a tournament</h2>
          <p className="mt-3 text-xs leading-6 text-muted-foreground">
            You will judge independently and cannot enter as a player. Seeding follows join order;
            every match uses the same motion and timing.
          </p>
          <form onSubmit={create} className="mt-4 space-y-4">
            <label className="label">
              Tournament title
              <input className="field" name="title" minLength={3} maxLength={100} required />
            </label>
            <label className="label">
              Motion
              <textarea className="field" name="motion" minLength={10} maxLength={600} required />
            </label>
            <label className="label">
              Organizer alias
              <input className="field" name="alias" minLength={2} maxLength={40} required />
            </label>
            <label className="label">
              Player capacity
              <select className="field" name="capacity">
                <option>2</option>
                <option>4</option>
                <option>8</option>
              </select>
            </label>
            <TimingFields />
            {error && (
              <p role="alert" className="notice notice-error">
                {error}
              </p>
            )}
            <Button disabled={busy}>Create tournament</Button>
          </form>
        </Card>
        <JoinInvitation />
      </div>
      <Card className="mt-6 p-6">
        <h2 className="section-title">Your events</h2>
        {events.loading ? (
          <LoadingState />
        ) : events.error ? (
          <ErrorState message={events.error} retry={() => void events.reload()} />
        ) : events.data?.length ? (
          <div className="mt-4 divide-y divide-border">
            {events.data.map((t) => (
              <Link
                className="flex justify-between gap-4 py-4 hover:text-primary"
                href={`/tournaments/${t.id}`}
                key={t.id}
              >
                <span>
                  {t.title}
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {t.capacity} players · {new Date(t.created_at).toLocaleDateString()}
                  </span>
                </span>
                <span className="badge">{t.status}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Your organized and joined tournaments will appear here.
          </p>
        )}
        <div className="mt-4 flex gap-3">
          <Button
            variant="outline"
            disabled={!offset}
            onClick={() => setOffset(Math.max(0, offset - 30))}
          >
            Previous events
          </Button>
          <Button
            variant="outline"
            disabled={(events.data?.length || 0) < 30}
            onClick={() => setOffset(offset + 30)}
          >
            More events
          </Button>
        </div>
      </Card>
    </>
  );
}
