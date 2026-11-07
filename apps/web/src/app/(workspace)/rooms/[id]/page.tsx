'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { RoomDetail } from '@verbalist/shared-types';
import { useRoom } from '@/hooks/use-room';
import { useRoomAudio } from '@/hooks/use-room-audio';
import { useWorkspace } from '@/components/workspace-provider';
import { api, json, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader, LoadingState, ErrorState } from '@/components/page-elements';
import { Invitations } from '@/components/multiplayer-common';
import { RoomVoice, RoomDictation } from '@/components/room-voice';
export default function Room() {
  const { id } = useParams<{ id: string }>();
  return <RoomSession key={id} id={id} />;
}
function RoomSession({ id }: { id: string }) {
  const audio = useRoomAudio(id);
  const state = useRoom(id, audio.receive, audio.leave, audio.allowNavigation);
  const { provider, apiKey } = useWorkspace();
  const [reason, setReason] = useState(''),
    [rank, setRank] = useState(false),
    [dictating, setDictating] = useState(false),
    [winner, setWinner] = useState('proposition'),
    [reviewed, setReviewed] = useState(false),
    [basis, setBasis] = useState('manual');
  const submission = useRef<{ text: string; id: string } | null>(null),
    ballotRequest = useRef<string | null>(null),
    resultRequest = useRef<{ body: string; id: string } | null>(null);
  const detail = state.detail,
    room = detail?.room,
    self = detail?.members.find((m) => m.user_id === detail.self_id),
    player = self?.role === 'proposition' || self?.role === 'opposition',
    judge = self?.role === 'judge',
    manager = judge || room?.owner_id === detail?.self_id,
    current = (room?.turn_count || 0) % 2 === 0 ? 'proposition' : 'opposition',
    floor =
      !!room &&
      player &&
      self?.role === current &&
      room.status === 'active' &&
      state.clock.phase === 'speaking' &&
      state.clock.remaining > 0;
  useEffect(() => {
    audio.bindTransport({
      connection: () => state.live.connection.current,
      send: state.live.send,
    });
    if (detail) audio.setContext(detail, floor);
  });
  if (!detail)
    return state.error ? (
      <ErrorState message={state.error} retry={() => void state.load()} />
    ) : (
      <LoadingState />
    );
  function command(action: string, data: Record<string, unknown> = {}) {
    void state.mutate(async () => {
      const before = state.detailRef.current!;
      const execute = (expected_version: number) =>
        api<RoomDetail>(
          `/v1/rooms/${id}/actions`,
          json('POST', { expected_version, action, data }),
        );
      try {
        return await execute(before.room.version);
      } catch (error) {
        // Retry an independent readiness change only if our own flag is unchanged.
        if (error instanceof ApiError && error.status === 409 && action === 'ready') {
          const fresh = await api<RoomDetail>(`/v1/rooms/${id}`);
          if (
            fresh.room.status === 'lobby' &&
            fresh.members.find((m) => m.user_id === fresh.self_id)?.ready ===
              before.members.find((m) => m.user_id === before.self_id)?.ready
          )
            return execute(fresh.room.version);
        }
        throw error;
      }
    });
  }
  async function submit() {
    await state.mutate(async () => {
      const text = state.draftRef.current;
      if (!submission.current || submission.current.text !== text)
        submission.current = { text, id: crypto.randomUUID() };
      const value = await api<RoomDetail>(
        `/v1/rooms/${id}/turns`,
        json('POST', {
          expected_version: state.detailRef.current!.room.version,
          expected_draft_version: state.draftVersion.current,
          request_id: submission.current.id,
          content: text,
        }),
      );
      submission.current = null;
      return value;
    });
  }
  async function advisory() {
    await state.mutate(async () => {
      if (!provider) throw Error('Choose an AI provider in Settings.');
      ballotRequest.current ??= crypto.randomUUID();
      await api(
        `/v1/rooms/${id}/ballots`,
        json('POST', {
          ...provider,
          expected_version: state.detailRef.current!.room.version,
          request_id: ballotRequest.current,
        }),
        apiKey,
      );
      ballotRequest.current = null;
      return api<RoomDetail>(`/v1/rooms/${id}`);
    });
  }
  async function confirm() {
    await state.mutate(async () => {
      const body = {
        winner,
        reason,
        basis,
        ballot_id: basis === 'ai_assisted' ? state.detailRef.current!.ballot?.id : null,
        reviewed,
      };
      const fingerprint = JSON.stringify(body);
      if (resultRequest.current?.body !== fingerprint)
        resultRequest.current = { body: fingerprint, id: crypto.randomUUID() };
      await api(
        `/v1/rooms/${id}/result`,
        json('POST', {
          ...body,
          expected_version: state.detailRef.current!.room.version,
          request_id: resultRequest.current!.id,
        }),
      );
      resultRequest.current = null;
      return api<RoomDetail>(`/v1/rooms/${id}`);
    });
  }
  return (
    <>
      <PageHeader
        eyebrow="PRIVATE HUMAN DEBATE"
        title={detail.room.motion}
        description="Six alternating speeches · proposition opens · shared transcript, private drafts"
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="badge">{detail.room.status}</span>
        <span className="text-xs text-muted-foreground">Live updates: {state.live.state}</span>
        <span className="text-xs text-muted-foreground">Your role: {self?.role}</span>
        {detail.room.tournament_id && (
          <Link className="text-sm text-primary" href={`/tournaments/${detail.room.tournament_id}`}>
            View tournament
          </Link>
        )}
      </div>
      {state.error && (
        <div className="notice notice-error mb-5" role="alert">
          {state.error}
          <Button size="sm" variant="outline" onClick={() => void state.load()}>
            Reload room
          </Button>
          {state.conflict && (
            <Button size="sm" variant="outline" onClick={() => void state.recover()}>
              Replace local draft with saved draft
            </Button>
          )}
        </div>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_350px]">
        <div className="space-y-6">
          <Card className="p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-5">
              <div>
                <p className="eyebrow">
                  SPEECH {Math.min(detail.room.turn_count + 1, 6)} / 6 · {current.toUpperCase()}
                </p>
                <h2 className="mt-2 text-xl font-medium">
                  {detail.room.status === 'lobby'
                    ? 'Waiting for both players'
                    : detail.room.status === 'completed'
                      ? 'Debate completed'
                      : state.clock.phase.replace('_', ' ')}
                </h2>
              </div>
              <p
                className="font-mono text-4xl tabular-nums text-primary"
                role="timer"
                aria-label="Room clock"
              >
                {Math.floor(state.clock.remaining / 60000)
                  .toString()
                  .padStart(2, '0')}
                :
                {Math.floor((state.clock.remaining / 1000) % 60)
                  .toString()
                  .padStart(2, '0')}
              </p>
            </div>
            <p className="mt-3 text-xs leading-6 text-muted-foreground">
              The server owns the clock and turn order. After time expires, review and submit the
              saved speech to continue; there is no automatic submission.
            </p>
            {player && detail.room.status === 'lobby' && (
              <div className="mt-5 space-y-4">
                <label className="flex gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={rank}
                    disabled={self?.ready || state.busy}
                    onChange={(e) => setRank(e.target.checked)}
                  />
                  Consent to practice standings for this room. Both players also need an opted-in{' '}
                  <Link href="/leaderboard" className="text-primary">
                    ranking profile
                  </Link>
                  .
                </label>
                <Button
                  disabled={state.busy}
                  onClick={() => command('ready', { ready: !self?.ready, ranking_consent: rank })}
                >
                  {self?.ready ? 'Withdraw readiness' : 'Ready to debate'}
                </Button>
              </div>
            )}
            {manager && detail.room.status === 'lobby' && (
              <Button
                className="mt-4"
                disabled={
                  state.busy ||
                  detail.members.filter(
                    (m) => ['proposition', 'opposition'].includes(m.role) && m.ready,
                  ).length !== 2
                }
                onClick={() => command('start')}
              >
                Start human debate
              </Button>
            )}
            {detail.room.status === 'active' &&
              ['ready', 'preparation'].includes(state.clock.phase) &&
              (self?.role === current || judge) && (
                <Button className="mt-4" disabled={state.busy} onClick={() => command('speak')}>
                  Start {current} speaking clock
                </Button>
              )}
          </Card>
          <Card className="p-5 sm:p-7">
            <h2 className="section-title">Shared transcript</h2>
            {detail.turns.length ? (
              <ol className="mt-5 space-y-4">
                {detail.turns.map((t) => (
                  <li className="rounded-xl border border-border p-4" key={t.id}>
                    <p className="eyebrow">
                      {t.position + 1}. {t.side} ·{' '}
                      {detail.members.find((m) => m.user_id === t.author_id)?.alias ||
                        'Former member'}
                    </p>
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">
                      {t.content}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Submitted speeches will appear here for room members.
              </p>
            )}
          </Card>
          {player && !['completed', 'cancelled'].includes(detail.room.status) && (
            <Card className="p-5 sm:p-7">
              <div className="flex items-center justify-between gap-3">
                <h2 className="section-title">Your private speech draft</h2>
                <span className="text-xs text-muted-foreground" role="status">
                  Draft {state.saveState}
                </span>
              </div>
              <label className="label mt-4">
                Speech text
                <textarea
                  className="field min-h-56"
                  maxLength={8000}
                  value={state.draft}
                  disabled={state.busy || state.conflict}
                  onChange={(e) => state.setDraft(e.target.value)}
                  placeholder="Draft here. Other members cannot see this until you submit."
                />
              </label>
              <RoomDictation
                enabled={
                  floor && !state.busy && !state.conflict && state.live.state === 'connected'
                }
                getText={() => state.draftRef.current}
                onText={state.setDraft}
                onActive={setDictating}
              />
              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  disabled={state.busy || state.conflict}
                  onClick={() => void state.flush().catch(() => {})}
                >
                  Save private draft
                </Button>
                <Button
                  disabled={
                    state.busy ||
                    state.conflict ||
                    dictating ||
                    self?.role !== current ||
                    detail.room.status !== 'active' ||
                    !['speaking', 'expired'].includes(state.clock.phase) ||
                    !state.draft.trim()
                  }
                  onClick={() => void submit()}
                >
                  Submit shared speech
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {state.draft.length}/8000 characters. Submission is final. Typed and dictated text
                use the same transcript.
              </p>
            </Card>
          )}
          {detail.ballot && (
            <Card className="p-6">
              <h2 className="section-title">Advisory transcript ballot</h2>
              <p className="mt-2 text-xs text-muted-foreground">
                {detail.ballot.provider} / {detail.ballot.model} ·{' '}
                {detail.ballot.simulated
                  ? 'Development simulation · excluded from AI-assisted rankings'
                  : 'Human review required'}{' '}
                · delivery not assessed
              </p>
              <p className="my-4 text-sm leading-7">{detail.ballot.payload.decision}</p>
              <div className="grid gap-4 md:grid-cols-2">
                {(['proposition', 'opposition'] as const).map((side) => (
                  <div key={side}>
                    <h3 className="font-medium capitalize">{side}</h3>
                    {Object.entries(detail.ballot!.payload[side]).map(([skill, value]) => (
                      <details
                        className="mt-3 rounded-lg border border-border p-3 text-sm"
                        key={skill}
                      >
                        <summary>
                          {skill}: {value.score}/10
                        </summary>
                        <p className="mt-2 leading-6">{value.rationale}</p>
                        <blockquote className="mt-2 border-l-2 border-primary pl-3 text-xs">
                          Speech {value.ref.position + 1}: “{value.ref.quote}”
                        </blockquote>
                      </details>
                    ))}
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs leading-6">
                {detail.ballot.payload.uncertainty} · Confidence{' '}
                {Math.round(detail.ballot.payload.confidence * 100)}%
              </p>
            </Card>
          )}
          {detail.result ? (
            <Card className="border-primary/40 p-6">
              <p className="eyebrow">HUMAN-CONFIRMED RESULT</p>
              <h2 className="mt-3 text-2xl capitalize">
                {detail.result.winner === 'draw'
                  ? 'Draw'
                  : detail.result.winner === 'proposition'
                    ? 'Proposition wins'
                    : 'Opposition wins'}
              </h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{detail.result.reason}</p>
              <p className="mt-3 text-xs text-muted-foreground">
                {detail.result.basis.replace('_', ' ')} ·{' '}
                {detail.result.ranked
                  ? 'Practice standings credited'
                  : 'No practice ranking credit'}
              </p>
            </Card>
          ) : judge && detail.room.status === 'completed' ? (
            <Card className="p-6">
              <h2 className="section-title">Independent judge review</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Read the transcript and decide independently. AI feedback is optional and advisory.
                Confirming publishes an immutable result to members and advances an event match.
              </p>
              <Button
                className="mt-4"
                variant="outline"
                disabled={state.busy || detail.turns.length < 2}
                onClick={() => void advisory()}
              >
                Request advisory AI ballot
              </Button>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void confirm();
                }}
                className="mt-5 space-y-4"
              >
                <label className="label">
                  Reviewed outcome
                  <select
                    className="field"
                    value={winner}
                    onChange={(e) => setWinner(e.target.value)}
                  >
                    <option value="proposition">Proposition wins</option>
                    <option value="opposition">Opposition wins</option>
                    {!detail.room.tournament_id && <option value="draw">Draw</option>}
                  </select>
                </label>
                <label className="label">
                  Decision basis
                  <select
                    className="field"
                    value={basis}
                    onChange={(e) => setBasis(e.target.value)}
                  >
                    <option value="manual">Independent human review</option>
                    <option value="ai_assisted" disabled={!detail.ballot}>
                      Human review with advisory AI ballot
                    </option>
                  </select>
                </label>
                <label className="label">
                  Written decision
                  <textarea
                    className="field min-h-28"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    minLength={10}
                    maxLength={2000}
                    required
                  />
                </label>
                <label className="flex gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    onChange={(e) => setReviewed(e.target.checked)}
                    required
                  />
                  I independently reviewed the transcript and confirm this final decision.
                </label>
                <Button disabled={state.busy || !reviewed}>Confirm final result</Button>
              </form>
            </Card>
          ) : null}
        </div>
        <div className="space-y-5">
          <RoomVoice
            audio={audio}
            detail={detail}
            connected={state.live.state === 'connected'}
            player={!!player}
            floor={floor}
          />
          <Card className="p-5">
            <h2 className="section-title">Room members</h2>
            <ul className="mt-4 space-y-4">
              {detail.members.map((m) => (
                <li key={m.id}>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="font-medium">
                      {m.alias}
                      {m.user_id === detail.self_id ? ' (you)' : ''}
                    </span>
                    <span className="text-xs text-muted-foreground">{m.role}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {m.ready ? 'Ready' : 'Not ready'} ·{' '}
                    {m.voice_muted
                      ? 'Moderator muted'
                      : state.peers.find((p) => p.user_id === m.user_id)?.voice
                        ? 'In live audio'
                        : 'Audio off'}
                  </p>
                  {manager &&
                    m.user_id !== detail.room.owner_id &&
                    m.user_id !== detail.self_id && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={state.busy}
                          onClick={() =>
                            command('mute', { user_id: m.user_id, muted: !m.voice_muted })
                          }
                        >
                          {m.voice_muted ? 'Unmute' : 'Mute'} {m.alias}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={state.busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Remove ${m.alias}? Removing a player during an ongoing debate cancels it.`,
                              )
                            )
                              command('remove', {
                                user_id: m.user_id,
                                reason: 'Removed by room moderator',
                              });
                          }}
                        >
                          Remove {m.alias}
                        </Button>
                      </div>
                    )}
                </li>
              ))}
            </ul>
          </Card>
          {manager && ['lobby', 'active', 'paused'].includes(detail.room.status) && (
            <Invitations
              path={`/v1/rooms/${id}/invitations`}
              roles={
                detail.room.status === 'lobby'
                  ? ['opposition', 'proposition', 'judge', 'spectator']
                  : ['spectator']
              }
              invites={detail.invites}
              reload={() => void state.load()}
              revoke={(invite_id) => command('revoke_invite', { invite_id })}
            />
          )}
          {(manager || player) && !['completed', 'cancelled'].includes(detail.room.status) && (
            <Card className="p-5">
              <h2 className="section-title">Room controls</h2>
              <label className="label mt-4">
                Control reason
                <textarea
                  className="field"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={2000}
                />
              </label>
              <div className="mt-4 flex flex-wrap gap-3">
                {manager && (
                  <>
                    {detail.room.status === 'active' && (
                      <Button
                        variant="outline"
                        disabled={state.busy || reason.length < 3}
                        onClick={() => command('pause', { reason })}
                      >
                        Pause debate
                      </Button>
                    )}
                    {detail.room.status === 'paused' && (
                      <Button
                        variant="outline"
                        disabled={state.busy || reason.length < 3}
                        onClick={() => command('resume', { reason })}
                      >
                        Resume debate
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      disabled={state.busy || reason.length < 3 || detail.turns.length < 2}
                      onClick={() => command('finish', { reason })}
                    >
                      Finish transcript
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={state.busy || reason.length < 3}
                      onClick={() => {
                        if (window.confirm('Cancel this debate? This cannot be undone.'))
                          command('cancel', { reason });
                      }}
                    >
                      Cancel debate
                    </Button>
                  </>
                )}
                {player && ['active', 'paused'].includes(detail.room.status) && (
                  <Button
                    variant="outline"
                    disabled={state.busy || reason.length < 10}
                    onClick={() => {
                      if (
                        window.confirm(
                          'Concede this debate? The other side wins after judge confirmation.',
                        )
                      )
                        command('concede', { reason });
                    }}
                  >
                    Concede debate
                  </Button>
                )}
              </div>
            </Card>
          )}
          <details className="rounded-xl border border-border p-4 text-xs">
            <summary>Room activity</summary>
            <ul className="mt-3 space-y-3">
              {detail.events.map((e) => (
                <li key={e.id}>
                  {e.action} · {new Date(e.created_at).toLocaleTimeString()} {e.reason}
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>
    </>
  );
}
