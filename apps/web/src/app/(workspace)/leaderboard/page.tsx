'use client';
import { useState, type FormEvent } from 'react';
import type { RankingProfile, Standing } from '@verbalist/shared-types';
import { useApi } from '@/hooks/use-api';
import { api, json } from '@/lib/api';
import { PageHeader, ErrorState, LoadingState } from '@/components/page-elements';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
export default function Leaderboard() {
  const standings = useApi<Standing[]>('/v1/leaderboard'),
    profile = useApi<RankingProfile | null>('/v1/ranking-profile');
  return (
    <>
      <PageHeader
        eyebrow="PRACTICE, TOGETHER"
        title="Practice standings"
        description="Opt-in aliases. Independently reviewed human debates. A practice record, not an official rating."
      />
      <Card className="p-6">
        <p className="text-sm leading-7 text-muted-foreground">
          A win earns 3 points, a draw 1 and a loss 0. Both debaters must consent in the room and
          have opted-in profiles when the independent judge confirms the result. Simulated
          AI-assisted results earn no credit. Opting out hides your standing; past eligible credits
          reappear if you opt in again.
        </p>
        {profile.loading ? (
          <LoadingState />
        ) : profile.error ? (
          <ErrorState message={profile.error} retry={() => void profile.reload()} />
        ) : (
          <Profile
            key={profile.data?.version || 0}
            value={profile.data}
            saved={(value) => {
              profile.replace(value);
              void standings.reload();
            }}
          />
        )}
      </Card>
      <Card className="mt-6 overflow-x-auto p-6">
        <h2 className="section-title">Consenting participants</h2>
        {standings.loading ? (
          <LoadingState />
        ) : standings.error ? (
          <ErrorState message={standings.error} retry={() => void standings.reload()} />
        ) : !standings.data?.length ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No eligible results yet. Nothing is ranked until both players consent and a judge
            confirms a result.
          </p>
        ) : (
          <table className="mt-5 w-full text-left text-sm">
            <thead>
              <tr>
                {['Rank', 'Alias', 'Points', 'Played', 'W / D / L'].map((v) => (
                  <th className="pb-4 pr-4 text-xs text-muted-foreground" key={v}>
                    {v}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {standings.data.map((s, i) => (
                <tr className="border-t border-border" key={s.handle}>
                  <td className="py-4">{s.rank || i + 1}</td>
                  <td>{s.handle}</td>
                  <td>{s.points}</td>
                  <td>{s.matches}</td>
                  <td>
                    {s.wins} / {s.draws} / {s.losses}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
function Profile({
  value,
  saved,
}: {
  value: RankingProfile | null;
  saved: (v: RankingProfile) => void;
}) {
  const [handle, setHandle] = useState(value?.handle || ''),
    [opted, setOpted] = useState(value?.opted_in || false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      saved(
        await api<RankingProfile>(
          '/v1/ranking-profile',
          json('PUT', { handle, opted_in: opted, expected_version: value?.version || 0 }),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save ranking preference.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="mt-6 max-w-lg space-y-4">
      <label className="label">
        Practice alias
        <input
          className="field"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          pattern="[A-Za-z0-9_]{3,30}"
          required
          minLength={3}
          maxLength={30}
        />
        <span className="text-xs text-muted-foreground">
          3–30 letters, numbers or underscores. Unique while opted in.
        </span>
      </label>
      <label className="flex gap-3 text-sm">
        <input type="checkbox" checked={opted} onChange={(e) => setOpted(e.target.checked)} />
        Show my alias and eligible results in practice standings.
      </label>
      {error && (
        <p role="alert" className="notice notice-error">
          {error}
        </p>
      )}
      <Button disabled={busy}>Save ranking preference</Button>
    </form>
  );
}
