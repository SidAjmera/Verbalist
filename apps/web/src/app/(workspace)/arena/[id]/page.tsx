'use client';
import { use, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  Cloud,
  Copy,
  Flag,
  LockKeyhole,
  Pause,
  Play,
  RotateCw,
  Send,
  Sparkles,
  Volume2,
  Square,
  Radio,
} from 'lucide-react';
import { nextSpeaker, type DebateDetail } from '@verbalist/shared-types';
import { useDebate } from '@/hooks/use-debate';
import { useWorkspace } from '@/components/workspace-provider';
import { ApiError, api, json } from '@/lib/api';
import { streamOpponent } from '@/lib/stream';
import { useAudio } from '@/hooks/use-audio';
import { useDebateClock } from '@/hooks/use-debate-clock';
import { DebateAudio } from '@/components/debate-audio';
import { DebateTimer } from '@/components/debate-timer';
import { AnalysisPanel } from '@/components/analysis-panel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState, LoadingState } from '@/components/page-elements';
export default function Debate({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <DebateSessionView key={id} id={id} />;
}
function DebateSessionView({ id }: { id: string }) {
  const audio = useAudio();
  const debate = useDebate(id, audio.allowNavigation);
  const { provider, apiKey, preferences } = useWorkspace();
  const [preview, setPreview] = useState('');
  const pending = useRef<AbortController | null>(null);
  const session = debate.detail?.session,
    turns = debate.detail?.turns || [];
  const clock = useDebateClock(session, debate.detail?.server_time);
  const stopCapture = audio.stopCapture,
    stopPlayback = audio.stopPlayback;
  const humanTurn = session
    ? (session.turn_count % 2 === 0) === (session.side === 'proposition')
    : false;
  useEffect(() => {
    if (session?.status !== 'active' || !humanTurn || debate.conflict || clock.phase === 'expired')
      stopCapture();
    if (session?.status === 'paused' || debate.conflict) stopPlayback();
  }, [session?.status, humanTurn, debate.conflict, clock.phase, stopCapture, stopPlayback]);
  useEffect(() => () => pending.current?.abort(), []);
  async function respond(streaming = true) {
    if (!provider) {
      debate.setError('Connect your AI provider in Settings first.');
      return;
    }
    audio.stopCapture();
    audio.stopPlayback();
    setPreview('');
    const controller = new AbortController();
    pending.current = controller;
    const result = await debate.mutate(async () => {
      try {
        return streaming
          ? await streamOpponent(
              id,
              provider,
              debate.detailRef.current!.session.version,
              apiKey,
              (delta) => setPreview((text) => text + delta),
              controller.signal,
            )
          : await api<DebateDetail>(
              `/v1/debates/${id}/respond`,
              {
                ...json('POST', {
                  ...provider,
                  expected_version: debate.detailRef.current!.session.version,
                }),
                signal: controller.signal,
              },
              apiKey,
            );
      } catch (error) {
        if (controller.signal.aborted)
          throw new ApiError(
            0,
            'Response stopped. Reload the saved debate before retrying; incomplete output is not saved.',
          );
        throw error;
      }
    });
    pending.current = null;
    setPreview('');
    const last = result?.turns.at(-1);
    if (
      last?.speaker === 'ai' &&
      preferences &&
      preferences.output_mode !== 'text' &&
      audio.support.synthesis
    )
      audio.play(last.content, preferences, result!.session.speaking_seconds);
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    const text = debate.draftRef.current.trim();
    if (!text) return;
    const requestId = crypto.randomUUID();
    await debate.mutate(() =>
      api<DebateDetail>(
        `/v1/debates/${id}/turns`,
        json('POST', {
          content: text,
          expected_version: debate.detailRef.current!.session.version,
          expected_draft_version: debate.draftVersion.current,
          request_id: requestId,
        }),
      ),
    );
  }
  async function status(value: 'active' | 'paused' | 'completed') {
    audio.stopCapture();
    audio.stopPlayback();
    await debate.mutate(() =>
      api<DebateDetail>(
        `/v1/debates/${id}/status`,
        json('PATCH', {
          status: value,
          expected_version: debate.detailRef.current!.session.version,
        }),
      ),
    );
  }
  async function startClock() {
    audio.stopPlayback();
    await debate.mutate(() =>
      api<DebateDetail>(
        `/v1/debates/${id}/clock/start`,
        json('POST', { expected_version: debate.detailRef.current!.session.version }),
      ),
    );
  }
  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(debate.draft);
      debate.setError('Your local draft was copied to the clipboard.');
    } catch {
      debate.setError('Clipboard unavailable. Select and copy your draft manually.');
    }
  }
  if (!session)
    return debate.error ? (
      <ErrorState message={debate.error} retry={() => void debate.load()} />
    ) : (
      <LoadingState />
    );
  const next = nextSpeaker(session),
    completed = session.status === 'completed';
  const round = Math.min(3, Math.floor(session.turn_count / 2) + 1);
  return (
    <>
      <Link
        href="/history"
        className="mb-6 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary"
      >
        <ArrowLeft size={14} />
        Your debates
      </Link>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-3xl">
          <div className="mb-3 flex flex-wrap gap-2">
            <span className="pill">QUICK DEBATE</span>
            <span className="pill pill-active">
              {completed
                ? 'Completed'
                : session.status === 'paused'
                  ? 'Paused'
                  : `Round ${round} of 3`}
            </span>
            <span className="pill capitalize">{session.difficulty}</span>
          </div>
          <h1 className="text-2xl font-semibold leading-snug tracking-tight sm:text-3xl">
            {session.motion}
          </h1>
          <p className="subtitle">
            You are the <span className="font-medium text-foreground">{session.side}</span>. Your
            opponent takes the {session.side === 'proposition' ? 'opposition' : 'proposition'}.
          </p>
        </div>
        <div className="flex gap-2">
          {!completed && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={debate.busy || debate.conflict}
                onClick={() => void status(session.status === 'paused' ? 'active' : 'paused')}
              >
                {session.status === 'paused' ? <Play /> : <Pause />}
                {session.status === 'paused' ? 'Resume' : 'Pause'}
              </Button>
              {session.turn_count >= 2 && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={debate.busy || debate.conflict}
                  onClick={() => void status('completed')}
                >
                  <Flag />
                  Finish
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      {debate.error && (
        <div className="notice notice-error mb-5" role="alert">
          {debate.error}
        </div>
      )}
      <p className="mb-5 flex items-center gap-2 text-xs text-muted-foreground" role="status">
        <Radio className={`size-3.5 ${debate.connection === 'connected' ? 'text-primary' : ''}`} />
        {debate.connection === 'connected'
          ? 'Live account sync connected'
          : debate.connection === 'offline'
            ? 'Offline — keep this page open; unsaved text stays in the editor'
            : debate.connection === 'unavailable'
              ? 'Live connection unavailable — saved progress refreshes periodically'
              : 'Reconnecting live updates — your saved transcript is safe'}
      </p>
      {debate.conflict && (
        <Card className="mb-6 p-5">
          <h2 className="section-title">Recover your draft</h2>
          <p className="mt-2 mb-4 text-sm leading-6 text-muted-foreground">
            Copy your local text first if you want to keep a separate version. Reloading uses the
            newest transcript from your account.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void copyDraft()}>
              <Copy />
              Copy local text
            </Button>
            <Button
              variant="outline"
              disabled={debate.busy}
              onClick={() => void debate.recover(false)}
            >
              Use saved draft
            </Button>
            <Button disabled={debate.busy || completed} onClick={() => void debate.recover(true)}>
              Keep my text on latest version
            </Button>
          </div>
        </Card>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_285px]">
        <div className="space-y-5">
          {session.timed && (
            <DebateTimer
              phase={clock.phase}
              remaining={clock.remaining}
              paused={session.status === 'paused'}
              canStart={
                next === 'human' &&
                !debate.busy &&
                !debate.conflict &&
                session.status !== 'completed' &&
                ['ready', 'preparation'].includes(clock.phase)
              }
              onStart={() => void startClock()}
            />
          )}
          {preferences && (
            <DebateAudio
              audio={audio}
              preferences={preferences}
              id={id}
              canSpeak={
                !completed &&
                session.status === 'active' &&
                next === 'human' &&
                !debate.busy &&
                !debate.conflict &&
                (!session.timed || clock.phase === 'speaking')
              }
              getText={() => debate.draftRef.current}
              onText={debate.setDraft}
            />
          )}
          <Card>
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="section-title">The conversation</h2>
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <LockKeyhole size={12} />
                Private transcript
              </span>
            </div>
            <div aria-live="polite" aria-relevant="additions" className="divide-y divide-border">
              {turns.length ? (
                turns.map((turn) => (
                  <article key={turn.id} className="p-5 sm:p-7">
                    <div className="mb-4 flex items-center gap-3">
                      <span
                        className={`flex size-8 items-center justify-center rounded-full text-xs font-semibold ${turn.speaker === 'human' ? 'bg-accent text-primary' : 'bg-muted text-muted-foreground'}`}
                      >
                        {turn.speaker === 'human' ? 'You' : <Sparkles size={15} />}
                      </span>
                      <div>
                        <h3 className="text-xs font-semibold">
                          {turn.speaker === 'human' ? 'You' : 'AI opponent'}{' '}
                          <span className="ml-2 font-normal text-muted-foreground">
                            {
                              ['Opening case', 'Rebuttal', 'Closing statement'][
                                Math.floor(turn.position / 2)
                              ]
                            }
                          </span>
                        </h3>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          Turn {turn.position + 1} ·{' '}
                          {new Date(turn.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                    {preferences?.output_mode === 'voice' &&
                    audio.support.synthesis &&
                    turn.speaker === 'ai' ? (
                      <details>
                        <summary className="cursor-pointer text-xs text-primary">
                          Show saved transcript
                        </summary>
                        <p className="transcript-content mt-3">{turn.content}</p>
                      </details>
                    ) : (
                      <p className="transcript-content">{turn.content}</p>
                    )}
                    {turn.speaker === 'ai' && preferences && audio.support.synthesis && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-3"
                        onClick={() =>
                          audio.play(turn.content, preferences, session.speaking_seconds)
                        }
                      >
                        <Volume2 />
                        Play response
                      </Button>
                    )}
                  </article>
                ))
              ) : (
                <div className="px-7 py-12 text-center">
                  <span className="eyebrow">A BLANK PAGE. A CLEAR POSITION.</span>
                  <h3 className="mt-3 text-lg font-medium">
                    {next === 'human' ? 'You have the floor.' : 'The proposition opens.'}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {next === 'human'
                      ? 'Define your terms, explain your position, and make your opening case.'
                      : 'Generate the AI’s opening case, then respond from the opposition.'}
                  </p>
                </div>
              )}
            </div>
          </Card>
          {completed ? (
            <Card className="border-primary/25 p-7">
              <div className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                  <CheckCheck size={21} />
                </span>
                <div>
                  <h2 className="text-xl font-medium tracking-tight">
                    Your debate is in the books.
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    Your transcript is saved. Revisit both sides and consider which argument you
                    would strengthen next. Generate your advisory evaluation and coaching plan
                    below.
                  </p>
                  <Button asChild className="mt-5">
                    <Link href="/arena">
                      Choose your next motion
                      <ArrowRight />
                    </Link>
                  </Button>
                </div>
              </div>
            </Card>
          ) : session.status === 'paused' ? (
            <Card className="p-7">
              <h2 className="section-title">Take a moment.</h2>
              <p className="subtitle mb-5">
                This debate is paused and saved to your account. Resume whenever you’re ready.
              </p>
              <Button
                disabled={debate.busy || debate.conflict}
                onClick={() => void status('active')}
              >
                <Play />
                Resume debate
              </Button>
            </Card>
          ) : next === 'ai' ? (
            <Card className="p-6">
              <div className="mb-4 flex items-center gap-2 text-sm font-medium">
                <Sparkles className="size-4 text-primary" />
                The floor belongs to your opponent.
              </div>
              <p className="mb-5 text-xs leading-6 text-muted-foreground">
                Your last turn is already saved. Generate the response with your selected provider.
                You can retry safely if the provider is unavailable.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled={debate.busy || debate.conflict} onClick={() => void respond()}>
                  {debate.busy ? <RotateCw className="motion-safe:animate-spin" /> : <Sparkles />}
                  {debate.busy ? 'Building a response…' : 'Generate opponent response'}
                </Button>
                {!debate.busy && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={debate.conflict}
                    onClick={() => void respond(false)}
                  >
                    Use standard response
                  </Button>
                )}
                {debate.busy && (
                  <Button variant="outline" size="sm" onClick={() => pending.current?.abort()}>
                    <Square />
                    Stop generation
                  </Button>
                )}
                <Link href="/settings" className="text-xs text-primary">
                  AI settings
                </Link>
              </div>
              {preview && (
                <div className="mt-5 rounded-lg border border-primary/25 bg-background p-4">
                  <p className="eyebrow mb-2">LIVE PREVIEW · SAVED WHEN COMPLETE</p>
                  <p className="transcript-content" aria-live="off">
                    {preview}
                  </p>
                </div>
              )}
            </Card>
          ) : null}
          {!completed && (next === 'human' || debate.conflict) && (
            <Card className="p-5 sm:p-6">
              <form onSubmit={send}>
                <div className="mb-4 flex items-center justify-between">
                  <label htmlFor="argument" className="text-sm font-semibold">
                    {debate.conflict ? 'Your local draft' : 'Your argument'}
                  </label>
                  <span
                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                    role="status"
                  >
                    {debate.saveState === 'saved' ? <Check size={12} /> : <Cloud size={12} />}{' '}
                    {debate.saveState === 'saved'
                      ? 'Saved to account'
                      : debate.saveState === 'saving'
                        ? 'Saving…'
                        : 'Unsaved changes'}
                  </span>
                </div>
                <textarea
                  id="argument"
                  className="field h-auto! min-h-52 leading-7"
                  placeholder="Make your claim. Explain the reasoning. Show why it matters."
                  value={debate.draft}
                  onChange={(e) => debate.setDraft(e.target.value)}
                  maxLength={8000}
                  disabled={debate.busy || session.status === 'paused'}
                  readOnly={audio.capture !== 'idle'}
                  required
                />
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-[11px] text-muted-foreground">
                    {debate.draft.length.toLocaleString()} / 8,000 characters
                  </span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={debate.busy || debate.conflict || debate.saveState === 'saved'}
                      onClick={() => void debate.flush().catch(() => {})}
                    >
                      Save draft
                    </Button>
                    <Button
                      type="submit"
                      disabled={
                        debate.busy ||
                        debate.conflict ||
                        !debate.draft.trim() ||
                        session.status !== 'active' ||
                        audio.capture !== 'idle' ||
                        (session.timed && !['speaking', 'expired'].includes(clock.phase))
                      }
                    >
                      <Send />
                      {debate.busy ? 'Saving turn…' : 'Submit argument'}
                    </Button>
                  </div>
                </div>
              </form>
            </Card>
          )}
        </div>
        <aside className="space-y-5 xl:sticky xl:top-24">
          <Card className="p-6">
            <p className="eyebrow mb-5">DEBATE STRUCTURE</p>
            <ol className="space-y-5">
              {['Opening cases', 'Rebuttals', 'Closing statements'].map((name, i) => (
                <li key={name} className="flex items-start gap-3">
                  <span
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-[10px] ${session.turn_count >= (i + 1) * 2 ? 'border-primary bg-primary text-white' : round === i + 1 ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}
                  >
                    {session.turn_count >= (i + 1) * 2 ? <Check size={12} /> : i + 1}
                  </span>
                  <span>
                    <span className="block pt-1 text-xs font-medium">{name}</span>
                    <span className="mt-1 block text-[10px] text-muted-foreground">
                      {Math.min(2, Math.max(0, session.turn_count - i * 2))} of 2 turns saved
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-6 border-t border-border pt-5 text-xs leading-6 text-muted-foreground">
              <p className="capitalize">Persona: {session.persona}</p>
              <p>Preparation: {session.preparation_seconds}s</p>
              <p>Speaking allowance: {session.speaking_seconds}s</p>
              <p>
                {session.timed ? 'Synchronized practice clocks' : 'Untimed practice'} ·{' '}
                {preferences?.input_mode === 'voice' ? 'Voice enabled' : 'Text input'}
              </p>
            </div>
          </Card>
          <p className="px-1 text-xs leading-6 text-muted-foreground">
            AI arguments may contain errors. No sources have been independently verified. Your model
            receives this debate’s transcript.
          </p>
          {provider?.provider === 'mock' && (
            <div className="notice">
              Development simulation enabled. Responses are scripted test data.
            </div>
          )}
        </aside>
      </div>
      <AnalysisPanel session={session} />
    </>
  );
}
