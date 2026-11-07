'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { TournamentDetail } from '@verbalist/shared-types';
import { useApi } from '@/hooks/use-api';
import { api, json } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader, ErrorState, LoadingState } from '@/components/page-elements';
import { Invitations } from '@/components/multiplayer-common';
export default function Tournament() {
  const { id } = useParams<{ id: string }>();
  const event = useApi<TournamentDetail>(`/v1/tournaments/${id}`);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [reason, setReason] = useState('');
  const busyRef = useRef(false);
  const { reload } = event;
  useEffect(() => {
    const tick = () => {
      if (!busyRef.current) void reload();
    };
    const timer = setInterval(tick, 5000);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', tick);
    };
  }, [reload]);
  async function command(action: string, data: Record<string, unknown> = {}) {
    if (!event.data || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    event.invalidate?.();
    try {
      event.replace(
        await api<TournamentDetail>(
          `/v1/tournaments/${id}/actions`,
          json('POST', { expected_version: event.data.tournament.version, action, data }),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Event changed. Reload first.');
      await event.reload();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  if (!event.data)
    return event.error ? (
      <ErrorState message={event.error} retry={() => void event.reload()} />
    ) : (
      <LoadingState />
    );
  const d = event.data,
    t = d.tournament,
    owner = t.owner_id === d.self_id,
    name = (uid: string | null) =>
      d.entries.find((e) => e.user_id === uid)?.alias || 'To be decided';
  return (
    <>
      <PageHeader eyebrow="PRIVATE SINGLE ELIMINATION" title={t.title} description={t.motion} />
      <div className="mb-5 flex flex-wrap gap-3">
        <span className="badge">{t.status}</span>
        <span className="text-sm text-muted-foreground">
          {d.entries.length}/{t.capacity} players · Judge: {t.host_alias}
        </span>
      </div>
      {error && (
        <p className="notice notice-error mb-5" role="alert">
          {error}
        </p>
      )}
      {event.error && (
        <p className="notice notice-error mb-5" role="alert">
          {event.error}
        </p>
      )}
      {t.winner_id && (
        <Card className="mb-6 border-primary/40 p-6">
          <p className="eyebrow">TOURNAMENT CHAMPION</p>
          <h2 className="mt-2 text-2xl">{name(t.winner_id)}</h2>
          <p className="mt-2 text-xs text-muted-foreground">
            All advancement came from independent human-confirmed match results.
          </p>
        </Card>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
        <Card className="p-6">
          <h2 className="section-title">
            {t.status === 'lobby' ? 'Player roster' : 'Tournament bracket'}
          </h2>
          {t.status === 'lobby' ? (
            <>
              <ol className="mt-5 space-y-3">
                {d.entries.map((e, i) => (
                  <li key={e.id} className="rounded-lg border border-border p-4 text-sm">
                    Seed {i + 1} · {e.alias}
                  </li>
                ))}
              </ol>
              <p className="my-5 text-xs leading-6 text-muted-foreground">
                Pairings follow join order. The roster must be full before seeding. Event players
                can observe all event match rooms; only the paired players submit speeches.
              </p>
              {owner && (
                <Button
                  disabled={busy || d.entries.length !== t.capacity}
                  onClick={() => void command('seed')}
                >
                  Seed tournament bracket
                </Button>
              )}
            </>
          ) : (
            <div className="mt-5 grid gap-6 md:grid-cols-2">
              {Array.from(new Set(d.matches.map((m) => m.round)))
                .sort()
                .map((round) => (
                  <section key={round}>
                    <h3 className="eyebrow">ROUND {round}</h3>
                    <div className="mt-3 space-y-4">
                      {d.matches
                        .filter((m) => m.round === round)
                        .map((m) => (
                          <div
                            key={m.id}
                            className="rounded-xl border border-border bg-accent/20 p-4"
                          >
                            <p className="text-xs text-muted-foreground">Match {m.slot}</p>
                            <p className="mt-2 text-sm">Proposition: {name(m.proposition_id)}</p>
                            <p className="mt-2 text-sm">Opposition: {name(m.opposition_id)}</p>
                            {m.winner_id && (
                              <p className="mt-3 text-sm font-medium text-primary">
                                Winner: {name(m.winner_id)}
                              </p>
                            )}
                            {m.scheduled_at && (
                              <p className="mt-3 text-xs text-muted-foreground">
                                Scheduled {new Date(m.scheduled_at).toLocaleString()}
                              </p>
                            )}
                            {m.room_id ? (
                              <Button variant="outline" size="sm" asChild className="mt-4">
                                <Link href={`/rooms/${m.room_id}`}>
                                  Open round {m.round} match {m.slot}
                                </Link>
                              </Button>
                            ) : (
                              <p className="mt-3 text-xs text-muted-foreground">
                                Room opens when both winners advance.
                              </p>
                            )}
                            {owner && t.status === 'active' && m.room_id && !m.result_id && (
                              <form
                                className="mt-4 space-y-3"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  const f = new FormData(e.currentTarget);
                                  const value = String(f.get('schedule'));
                                  void command('schedule', {
                                    match_id: m.id,
                                    scheduled_at: value ? new Date(value).toISOString() : null,
                                  });
                                }}
                              >
                                <label className="label">
                                  Match start time
                                  <input
                                    className="field"
                                    name="schedule"
                                    type="datetime-local"
                                    aria-label={`Round ${round} match ${m.slot} start time`}
                                  />
                                </label>
                                <Button size="sm" variant="ghost" disabled={busy}>
                                  Save match schedule
                                </Button>
                                <p className="text-xs text-muted-foreground">
                                  Your local time. Leave blank to clear; an active match cannot be
                                  rescheduled.
                                </p>
                              </form>
                            )}
                          </div>
                        ))}
                    </div>
                  </section>
                ))}
            </div>
          )}
        </Card>
        <div className="space-y-5">
          {owner && t.status === 'lobby' && (
            <Invitations
              path={`/v1/tournaments/${id}/invitations`}
              roles={['entrant']}
              invites={d.invites}
              reload={() => void event.reload()}
              revoke={(invite_id) => void command('revoke_invite', { invite_id })}
            />
          )}
          <Card className="p-5">
            <h2 className="section-title">Event rules</h2>
            <p className="mt-3 text-xs leading-6 text-muted-foreground">
              Players alternate proposition and opposition according to their bracket slots. Each
              room has six speeches, private drafts and optional live voice. The organizer
              independently judges every match. Draws cannot advance. A cancelled match requires
              cancelling the event and starting a new one.
            </p>
            {owner && ['lobby', 'active'].includes(t.status) && (
              <div className="mt-4 space-y-3">
                <label className="label">
                  Cancellation reason
                  <input
                    className="field"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    minLength={3}
                    maxLength={2000}
                  />
                </label>
                <Button
                  variant="destructive"
                  disabled={busy || reason.length < 3}
                  onClick={() => {
                    if (window.confirm('Cancel this tournament and all unfinished match rooms?'))
                      void command('cancel', { reason });
                  }}
                >
                  Cancel tournament
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
