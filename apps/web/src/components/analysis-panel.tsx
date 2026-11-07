'use client';
import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { BrainCircuit, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import {
  SKILLS,
  type AnalysisDetail,
  type DebateSession,
  type TranscriptReference,
} from '@verbalist/shared-types';
import { useApi } from '@/hooks/use-api';
import { useWorkspace } from './workspace-provider';
import { api, json } from '@/lib/api';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { dateLabel } from '@/lib/utils';
const ArgumentGraph = dynamic(() => import('./argument-graph'), {
  ssr: false,
  loading: () => <p className="notice">Loading argument map…</p>,
});
export function Excerpt({ reference }: { reference: TranscriptReference }) {
  return (
    <details className="mt-3 text-xs">
      <summary className="w-fit cursor-pointer text-primary">
        Transcript excerpt · Turn {reference.position + 1}
      </summary>
      <blockquote className="mt-2 border-l-2 border-primary/40 pl-3 text-muted-foreground leading-6">
        {reference.quote}
      </blockquote>
    </details>
  );
}
export function AnalysisPanel({ session }: { session: DebateSession }) {
  const [reviewID, setReviewID] = useState(() =>
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('review')
      : null,
  );
  const {
    data: analysis,
    error: loadError,
    loading,
    reload,
    replace: setAnalysis,
  } = useApi<AnalysisDetail | null>(
    `/v1/debates/${session.id}/analysis${reviewID ? `?run_id=${encodeURIComponent(reviewID)}` : ''}`,
  );
  const { provider, apiKey } = useWorkspace();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [consent, setConsent] = useState(false);
  const pending = useRef(false),
    request = useRef<{ id: string; version: number } | null>(null);

  async function generate() {
    if (pending.current) return;
    if (!provider) {
      setError('Choose an AI provider in Settings first.');
      return;
    }
    pending.current = true;
    setBusy(true);
    setError('');
    if (!request.current || request.current.version !== session.version)
      request.current = { id: crypto.randomUUID(), version: session.version };
    try {
      setAnalysis(
        await api<AnalysisDetail>(
          `/v1/debates/${session.id}/analysis`,
          json('POST', {
            ...provider,
            expected_version: session.version,
            request_id: request.current.id,
          }),
          apiKey,
        ),
      );
      request.current = null;
      if (reviewID) {
        setReviewID(null);
        window.history.replaceState(null, '', `/arena/${session.id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed. Your transcript is safe.');
    } finally {
      setBusy(false);
      pending.current = false;
    }
  }
  async function research(id: string, version: number) {
    if (!provider || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      setAnalysis(
        await api<AnalysisDetail>(
          `/v1/claims/${id}/research`,
          json('POST', { ...provider, expected_version: version, consent }),
          apiKey,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Research failed.');
    } finally {
      setBusy(false);
      pending.current = false;
    }
  }
  return (
    <section className="mt-8 space-y-5" aria-label="Debate intelligence">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="eyebrow mb-3 text-primary!">FROM PRACTICE TO PROGRESS</p>
            <h2 className="section-title flex items-center gap-2">
              <BrainCircuit className="size-5 text-primary" />
              Review your reasoning
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              Explore the argument map, inspect potential reasoning flaws and turn feedback into
              focused practice. Final judging is advisory and based on the saved transcript.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || session.turn_count === 0} onClick={() => void generate()}>
              <Sparkles />
              {busy
                ? 'Reviewing…'
                : analysis
                  ? 'Analyze again'
                  : session.status === 'completed'
                    ? 'Evaluate debate'
                    : 'Analyze saved turns'}
            </Button>
            <Button
              aria-label="Reload analysis"
              variant="outline"
              disabled={busy}
              onClick={() => void reload()}
            >
              <RefreshCw />
            </Button>
          </div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Uses your selected model and session key. No delivery metrics: optional recordings stay on
          your device. Confidence is model-reported, not a calibrated probability.
        </p>
        {reviewID && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => {
              setReviewID(null);
              window.history.replaceState(null, '', `/arena/${session.id}`);
            }}
          >
            Viewing a saved evaluation · Show latest
          </Button>
        )}
        {session.status !== 'completed' && (
          <p className="mt-3 text-xs text-primary">
            You can inspect saved arguments now. Finish the debate for a final rubric ballot.
          </p>
        )}
        {(error || loadError) && (
          <p role="alert" className="notice notice-error mt-4">
            {error || loadError}
          </p>
        )}
        {loading && (
          <p role="status" className="mt-3 text-xs">
            Loading saved analysis…
          </p>
        )}
      </Card>
      {analysis && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="pill">{analysis.run.rubric_version}</span>
            <span>
              {analysis.run.provider} / {analysis.run.model}
            </span>
            <span>Saved {dateLabel(analysis.run.created_at)}</span>
            {analysis.run.simulated && (
              <span className="pill border-amber-500/50 text-amber-500">
                Development simulation · scores excluded from progress
              </span>
            )}
          </div>
          {analysis.run.session_version !== session.version && (
            <p className="notice">
              This review covers an earlier transcript version. Analyze again to include the latest
              saved turns.
            </p>
          )}
          <Card className="p-6">
            <h3 className="section-title">Argument map</h3>
            <p className="my-4 text-sm leading-7 text-muted-foreground">{analysis.run.summary}</p>
            <ArgumentGraph key={analysis.run.id} analysis={analysis} />
            <details className="mt-5">
              <summary className="cursor-pointer text-sm font-medium text-primary">
                Argument list & relationships
              </summary>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {analysis.arguments.map((item) => (
                  <article key={item.id} className="rounded-xl border border-border p-4">
                    <p className="eyebrow text-primary!">
                      {item.data.speaker === 'human' ? 'You' : 'Opponent'} ·{' '}
                      {item.data.kind.replaceAll('_', ' ')}
                    </p>
                    <p className="mt-3 text-sm">{item.data.text}</p>
                    <p className="mt-3 text-xs leading-6 text-muted-foreground">
                      {item.data.explanation}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Confidence {Math.round(item.data.confidence * 100)}% ·{' '}
                      {item.data.kind === 'potential_fallacy'
                        ? 'Potential finding, not a proven fallacy'
                        : 'AI interpretation'}
                    </p>
                    <Excerpt reference={item.data.ref} />
                  </article>
                ))}
              </div>
              <ul className="mt-4 space-y-3 text-xs text-muted-foreground">
                {analysis.links.map((link) => (
                  <li key={link.id}>
                    {analysis.arguments.find((a) => a.id === link.source_id)?.data.key} →{' '}
                    {analysis.arguments.find((a) => a.id === link.target_id)?.data.key} ·{' '}
                    {link.relation}: {link.explanation} ({Math.round(link.confidence * 100)}%
                    confidence)
                  </li>
                ))}
              </ul>
            </details>
            <p className="notice mt-5">{analysis.run.uncertainty}</p>
          </Card>
          {analysis.ballot && (
            <Card className="p-6">
              <h3 className="section-title">Advisory judge ballot</h3>
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl bg-accent p-4">
                  <p className="eyebrow">YOUR SCORE</p>
                  <p className="mt-3 text-3xl font-semibold text-primary">
                    {analysis.ballot.human_total}
                    <span className="text-sm text-muted-foreground"> / 100</span>
                  </p>
                </div>
                <div className="rounded-xl bg-background p-4">
                  <p className="eyebrow">OPPONENT SCORE</p>
                  <p className="mt-3 text-3xl font-semibold">
                    {analysis.ballot.ai_total}
                    <span className="text-sm text-muted-foreground"> / 100</span>
                  </p>
                </div>
                <div className="rounded-xl border border-border p-4">
                  <p className="eyebrow">ADVISORY RESULT</p>
                  <p className="mt-3 text-lg font-medium">
                    {analysis.ballot.winner === 'draw'
                      ? 'Close / draw'
                      : analysis.ballot.winner === 'human'
                        ? 'Your case leads'
                        : 'Opponent case leads'}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {Math.round(analysis.ballot.confidence * 100)}% confidence
                  </p>
                </div>
              </div>
              <p className="mt-5 text-sm leading-7">{analysis.ballot.decision}</p>
              <details className="mt-4 text-xs">
                <summary className="cursor-pointer text-primary">
                  Quick Debate rubric & scoring limits
                </summary>
                <p className="mt-3 leading-6 text-muted-foreground">
                  Reasoning 30%, evidence 20%, structure 20%, rebuttal 30%. Each skill is 0–10:
                  absent (0), weak/asserted (1–3), developing (4–6), clear/supported (7–8),
                  sustained/comparative (9–10). Total differences up to 3 points are a draw.
                  Evidence rewards qualification and support, not citation volume. Short debates
                  limit rebuttal opportunities. Delivery is not assessed. AI judgments may vary by
                  model and rerun; no official ranking is implied.
                </p>
              </details>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {SKILLS.map((skill) => (
                  <div key={skill} className="rounded-xl border border-border p-4">
                    <h4 className="text-sm font-medium capitalize">{skill}</h4>
                    <p className="mt-2 text-xs text-primary">
                      You {analysis.ballot!.human[skill].score}/10 · Opponent{' '}
                      {analysis.ballot!.ai[skill].score}/10
                    </p>
                    {(['human', 'ai'] as const).map((speaker) => (
                      <div key={speaker} className="mt-3 text-xs leading-6 text-muted-foreground">
                        <strong>{speaker === 'human' ? 'You' : 'Opponent'}: </strong>
                        {analysis.ballot![speaker][skill].rationale}
                        <Excerpt reference={analysis.ballot![speaker][skill].ref} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <h4 className="mt-5 text-sm font-medium">Key clashes</h4>
              {analysis.ballot.clashes.map((clash, i) => (
                <div key={i} className="mt-3 text-sm leading-7">
                  <p>{clash.text}</p>
                  <Excerpt reference={clash.ref} />
                </div>
              ))}
              <p className="notice mt-5">{analysis.ballot.uncertainty}</p>
            </Card>
          )}
          <Card className="p-6">
            <h3 className="section-title">Your coaching plan</h3>
            <p className="mt-4 text-sm leading-7">{analysis.coach.summary}</p>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              {(['strengths', 'weaknesses'] as const).map((kind) => (
                <div key={kind}>
                  <h4 className="eyebrow">
                    {kind === 'strengths' ? 'BUILD ON THIS' : 'FOCUS NEXT'}
                  </h4>
                  {analysis.coach[kind].map((finding, i) => (
                    <div
                      className="mt-3 rounded-lg border border-border p-4 text-xs leading-6"
                      key={i}
                    >
                      {finding.text}
                      <Excerpt reference={finding.ref} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="mt-5 space-y-4">
              {analysis.coach.actions.map((action, i) => (
                <article key={i} className="rounded-xl bg-accent/40 p-5">
                  <p className="eyebrow text-primary!">
                    {action.skill} / ACTION {i + 1}
                  </p>
                  <p className="mt-3 text-sm leading-7">{action.explanation}</p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Illustrative rewrite — not evidence:
                  </p>
                  <p className="mt-2 text-sm leading-7">{action.rewrite}</p>
                  <Excerpt reference={action.ref} />
                  <Button asChild variant="outline" size="sm" className="mt-4">
                    <Link href={`/practice?drill=${action.drill_id}`}>Practice this skill</Link>
                  </Button>
                </article>
              ))}
            </div>
            <Button asChild variant="ghost" className="mt-4">
              <Link href="/progress">See recurring focus areas & progress</Link>
            </Button>
          </Card>
          <Card className="p-6">
            <h3 className="section-title flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              Evidence checks
            </h3>
            <p className="mt-3 text-xs leading-6 text-muted-foreground">
              Claims begin unverified. Optional research retrieves sources through OpenAI web search
              and may incur provider charges. Verified/disputed labels are AI source assessments,
              not guarantees. A missing source never means false.
            </p>
            {provider?.provider === 'openai' ? (
              <label className="mt-4 flex gap-3 text-xs leading-6">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  Allow sending the selected claim to OpenAI web search using my session key.
                  Provider search charges may apply.
                </span>
              </label>
            ) : (
              <p className="notice mt-4">
                Research is optional. Select OpenAI with a web-search-capable model and a session
                key in Settings to research claims. Your current provider can still analyze debates.
              </p>
            )}
            {analysis.claims.length === 0 ? (
              <p className="mt-4 text-xs text-muted-foreground">
                No researchable factual claims were identified in this review.
              </p>
            ) : (
              analysis.claims.map((claim) => (
                <article key={claim.id} className="mt-4 rounded-xl border border-border p-5">
                  <span className="pill capitalize">
                    {claim.status} · {claim.checked_at ? 'AI source assessment' : 'No research yet'}
                  </span>
                  <p className="mt-3 text-sm leading-7">{claim.data.text}</p>
                  <p className="mt-2 text-xs leading-6 text-muted-foreground">
                    {claim.assessment} {claim.data.uncertainty}
                    {claim.checked_at &&
                      ` · OpenAI/${claim.research_model} · ${dateLabel(claim.checked_at)}`}
                  </p>
                  <Excerpt reference={claim.data.ref} />
                  <ul className="mt-3 space-y-2 text-xs">
                    {analysis.sources
                      .filter((s) => s.claim_id === claim.id)
                      .map((source) => (
                        <li key={source.id}>
                          <a
                            className="text-primary underline"
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {source.title}
                          </a>
                          <span className="ml-2 text-muted-foreground">
                            Retrieved {dateLabel(source.retrieved_at)}
                          </span>
                        </li>
                      ))}
                  </ul>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    disabled={busy || !consent || provider?.provider !== 'openai' || !apiKey}
                    onClick={() => void research(claim.id, claim.version)}
                  >
                    Research claim
                  </Button>
                </article>
              ))
            )}
          </Card>
        </>
      )}
    </section>
  );
}
