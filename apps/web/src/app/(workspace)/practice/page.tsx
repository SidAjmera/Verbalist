'use client';
import { useRef, useState, type FormEvent } from 'react';
import { Target, ArrowRight } from 'lucide-react';
import type { Drill, DrillAttempt } from '@verbalist/shared-types';
import { useApi } from '@/hooks/use-api';
import { useWorkspace } from '@/components/workspace-provider';
import { api, json } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState, PageHeader } from '@/components/page-elements';
export default function Practice() {
  const drills = useApi<Drill[]>('/v1/drills'),
    attempts = useApi<DrillAttempt[]>('/v1/drill-attempts');
  const [selected, setSelected] = useState('');
  const chosen = drills.data?.find((d) => d.id === selected);
  return (
    <>
      <PageHeader
        eyebrow="ONE SKILL. A LITTLE STRONGER."
        title="Practice with intention"
        description="Write, get rubric feedback, and save a focused practice attempt."
      />
      {drills.loading ? (
        <LoadingState />
      ) : drills.error ? (
        <ErrorState message={drills.error} retry={() => void drills.reload()} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {drills.data?.map((drill) => (
              <Card
                className={`p-6 ${chosen?.id === drill.id ? 'border-primary/50' : ''}`}
                key={drill.id}
              >
                <Target className="size-5 text-primary" />
                <p className="eyebrow mt-4 text-primary!">{drill.skill}</p>
                <h2 className="mt-3 text-lg font-medium">{drill.title}</h2>
                <p className="mt-3 text-xs leading-6 text-muted-foreground">{drill.prompt}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    setSelected(drill.id);
                    window.history.replaceState(null, '', `/practice?drill=${drill.id}`);
                  }}
                >
                  Practice {drill.title.toLowerCase()}
                  <ArrowRight />
                </Button>
              </Card>
            ))}
          </div>
          <DrillChoice
            drills={drills.data || []}
            selected={chosen}
            onSaved={() => void attempts.reload()}
          />
        </>
      )}
      <Card className="mt-7 p-6">
        <h2 className="section-title">Saved practice attempts</h2>
        {attempts.error ? (
          <ErrorState message={attempts.error} retry={() => void attempts.reload()} />
        ) : attempts.data?.length ? (
          <div className="mt-4 space-y-3">
            {attempts.data.map((attempt) => (
              <details key={attempt.id} className="rounded-xl border border-border p-4">
                <summary className="cursor-pointer text-sm">
                  {drills.data?.find((d) => d.id === attempt.drill_id)?.title || attempt.drill_id} ·{' '}
                  {attempt.score}/6 {attempt.simulated ? '· Development simulation' : ''}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {new Date(attempt.created_at).toLocaleDateString()}
                  </span>
                </summary>
                <p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-muted-foreground">
                  {attempt.response}
                </p>
                <Feedback attempt={attempt} />
              </details>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Your submitted attempts will appear here after feedback is saved.
          </p>
        )}
      </Card>
    </>
  );
}
function DrillChoice({
  drills,
  selected,
  onSaved,
}: {
  drills: Drill[];
  selected: Drill | undefined;
  onSaved: () => void;
}) {
  const [fromURL] = useState(() =>
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('drill') : null,
  );
  const drill = selected || drills.find((d) => d.id === fromURL);
  return drill ? (
    <DrillEditor key={drill.id} drill={drill} onSaved={onSaved} />
  ) : (
    <p className="notice mt-6">
      Choose a drill above to begin. Your feedback and response save privately to your account.
    </p>
  );
}
function DrillEditor({ drill, onSaved }: { drill: Drill; onSaved: () => void }) {
  const { provider, apiKey } = useWorkspace();
  const [response, setResponse] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState<DrillAttempt | null>(null);
  const pending = useRef(false),
    request = useRef<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!provider) {
      setError('Choose an AI provider in Settings first.');
      return;
    }
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    request.current ??= crypto.randomUUID();
    try {
      setSaved(
        await api<DrillAttempt>(
          `/v1/drills/${drill.id}/attempts`,
          json('POST', { ...provider, request_id: request.current, response }),
          apiKey,
        ),
      );
      request.current = null;
      onSaved();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Feedback failed; your response is still in the editor.',
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <Card className="mt-6 p-6 sm:p-7" id="drill-editor">
      <h2 className="section-title">Your drill: {drill.title}</h2>
      <p className="mt-4 text-sm leading-7">{drill.prompt}</p>
      <p className="mt-4 text-xs leading-6 text-muted-foreground">
        Three criteria, each scored 0 (absent), 1 (partial) or 2 (clear and explained). This is
        advisory feedback. Uses your selected provider and session key.
      </p>
      <ol className="mt-3 list-inside list-decimal space-y-2 text-xs text-muted-foreground">
        {drill.criteria.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
      <form onSubmit={submit} className="mt-5">
        <label className="label">
          Your practice response
          <textarea
            className="field min-h-44"
            minLength={40}
            maxLength={4000}
            required
            disabled={busy}
            value={response}
            onChange={(event) => {
              setResponse(event.target.value);
              request.current = null;
            }}
          />
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          {response.length}/4,000 characters · Minimum 40. Response saves when feedback completes.
        </p>
        {error && (
          <p role="alert" className="notice notice-error mt-4">
            {error}
          </p>
        )}
        <Button
          className="mt-4"
          type="submit"
          disabled={busy || response.trim().length < 40 || saved?.response === response}
        >
          {busy ? 'Reviewing your practice…' : 'Get feedback & save'}
        </Button>
      </form>
      {saved && (
        <>
          <p className="mt-5 text-xs text-primary" role="status">
            Practice saved to your account
          </p>
          <Feedback attempt={saved} />
        </>
      )}
    </Card>
  );
}
function Feedback({ attempt }: { attempt: DrillAttempt }) {
  return (
    <div className="mt-5 space-y-3">
      {attempt.simulated && (
        <p className="notice">
          Development simulation — not a real skill evaluation. Excluded from progress and drill
          achievements.
        </p>
      )}
      <p className="text-sm font-medium">Advisory drill score: {attempt.score}/6</p>
      <p className="text-xs leading-6 text-muted-foreground">{attempt.feedback.summary}</p>
      {attempt.feedback.criteria.map((criterion, index) => (
        <div key={index} className="rounded-lg bg-background p-4 text-xs leading-6">
          <p className="font-medium">
            Criterion {index + 1}: {criterion.score}/2
          </p>
          <p>{criterion.explanation}</p>
          <blockquote className="mt-2 border-l-2 border-primary/30 pl-3 text-muted-foreground">
            {criterion.quote}
          </blockquote>
        </div>
      ))}
      <p className="text-xs leading-6">
        <strong>Try next: </strong>
        {attempt.feedback.improvement}
      </p>
      <p className="text-[11px] text-muted-foreground">
        {attempt.provider}/{attempt.model} · {attempt.rubric_version}
      </p>
    </div>
  );
}
