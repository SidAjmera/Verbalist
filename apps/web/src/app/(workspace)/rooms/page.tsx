'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { RoomDetail, SharedRoom } from '@verbalist/shared-types';
import { useApi } from '@/hooks/use-api';
import { api, json } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader, ErrorState, LoadingState } from '@/components/page-elements';
import { JoinInvitation, TimingFields } from '@/components/multiplayer-common';
export default function Rooms() {
  const router = useRouter();
  const [offset, setOffset] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const rooms = useApi<SharedRoom[]>(`/v1/rooms?offset=${offset}`);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      const value = await api<RoomDetail>(
        '/v1/rooms',
        json('POST', {
          motion: data.get('motion'),
          alias: data.get('alias'),
          role: data.get('role'),
          preparation_seconds: Number(data.get('preparation_seconds')),
          speaking_seconds: Number(data.get('speaking_seconds')),
        }),
      );
      router.push(`/rooms/${value.room.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create room.');
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="THINK TOGETHER"
        title="Multiplayer rooms"
        description="Private human debates. Shared clocks, live voice and an independent human judge."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <h2 className="section-title">Create a private room</h2>
          <form onSubmit={create} className="mt-4 space-y-4">
            <label className="label">
              Motion
              <textarea
                className="field min-h-24"
                name="motion"
                required
                minLength={10}
                maxLength={600}
                placeholder="This house would…"
              />
            </label>
            <label className="label">
              Your room alias
              <input className="field" name="alias" required minLength={2} maxLength={40} />
            </label>
            <label className="label">
              Your role
              <select className="field" name="role">
                <option value="proposition">Proposition debater</option>
                <option value="judge">Independent judge</option>
              </select>
            </label>
            <TimingFields />
            <p className="text-xs leading-6 text-muted-foreground">
              Six alternating speeches, proposition first. Only submitted text is shared. Audio
              saving is off by default. Share invitations manually; members see your room alias.
            </p>
            {error && (
              <p role="alert" className="notice notice-error">
                {error}
              </p>
            )}
            <Button disabled={busy}>Create room</Button>
          </form>
        </Card>
        <JoinInvitation />
      </div>
      <Card className="mt-6 p-6">
        <h2 className="section-title">Your rooms</h2>
        {rooms.loading ? (
          <LoadingState />
        ) : rooms.error ? (
          <ErrorState message={rooms.error} retry={() => void rooms.reload()} />
        ) : !rooms.data?.length ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No rooms on this page. Create a room or accept an invitation.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-border">
            {rooms.data.map((r) => (
              <Link
                className="flex items-center justify-between gap-4 py-4 hover:text-primary"
                key={r.id}
                href={`/rooms/${r.id}`}
              >
                <span className="min-w-0">
                  <span className="block font-medium">{r.motion}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString()} · {r.turn_count}/6 speeches
                  </span>
                </span>
                <span className="badge">{r.status}</span>
              </Link>
            ))}
          </div>
        )}
        <div className="mt-4 flex gap-3">
          <Button
            variant="outline"
            disabled={!offset}
            onClick={() => setOffset(Math.max(0, offset - 30))}
          >
            Previous rooms
          </Button>
          <Button
            variant="outline"
            disabled={(rooms.data?.length || 0) < 30}
            onClick={() => setOffset(offset + 30)}
          >
            More rooms
          </Button>
        </div>
      </Card>
    </>
  );
}
