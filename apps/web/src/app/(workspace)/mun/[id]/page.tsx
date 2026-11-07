'use client';
import { useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { MUNDetail } from '@verbalist/shared-types';
import { useMUN } from '@/hooks/use-mun';
import { useWorkspace } from '@/components/workspace-provider';
import { api, json } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader, LoadingState, ErrorState } from '@/components/page-elements';
export default function MUNSession() {
  const { id } = useParams<{ id: string }>();
  return <Session key={id} id={id} />;
}
function Session({ id }: { id: string }) {
  const state = useMUN(id),
    { provider, apiKey } = useWorkspace();
  const [topic, setTopic] = useState(''),
    [target, setTarget] = useState('1');
  const request = useRef<{ content: string; id: string } | null>(null),
    replyRequest = useRef<{ config: string; id: string } | null>(null);
  const detail = state.detail;
  if (!detail)
    return state.error ? (
      <ErrorState message={state.error} retry={() => void state.load()} />
    ) : (
      <LoadingState />
    );
  const c = detail.committee,
    speaker = detail.delegates.find((d) => d.ordinal === c.current_ordinal)!,
    open = ['active', 'paused'].includes(c.status);
  function action(action: string) {
    void state.mutate(() =>
      api<MUNDetail>(
        `/v1/mun/${id}/actions`,
        json('POST', {
          expected_version: state.current.current!.committee.version,
          action,
          ...(['caucus', 'negotiate'].includes(action)
            ? { topic, target_ordinal: action === 'negotiate' ? Number(target) : null }
            : {}),
        }),
      ),
    );
  }
  async function submit() {
    await state.mutate(async () => {
      const content = state.text.current;
      if (request.current?.content !== content)
        request.current = { content, id: crypto.randomUUID() };
      const value = await api<MUNDetail>(
        `/v1/mun/${id}/speeches`,
        json('POST', {
          expected_version: state.current.current!.committee.version,
          expected_draft_version: state.draftVersion.current,
          request_id: request.current!.id,
          content,
        }),
      );
      request.current = null;
      return value;
    });
  }
  async function ask() {
    await state.mutate(async () => {
      if (!provider) throw Error('Choose an AI provider in Settings.');
      const config = JSON.stringify(provider);
      if (replyRequest.current?.config !== config)
        replyRequest.current = { config, id: crypto.randomUUID() };
      const value = await api<MUNDetail>(
        `/v1/mun/${id}/reply`,
        json('POST', {
          ...provider,
          expected_version: state.current.current!.committee.version,
          request_id: replyRequest.current!.id,
        }),
        apiKey,
      );
      replyRequest.current = null;
      return value;
    });
  }
  return (
    <>
      <PageHeader
        eyebrow="PRIVATE MUN PRACTICE"
        title={c.agenda}
        description="Prepare clearly. Listen carefully. Negotiate a shared path forward."
      />
      <div className="mb-5 flex flex-wrap gap-3 text-xs">
        <span className="badge">{c.status}</span>
        <span className="text-muted-foreground">
          {c.stage} · {c.message_count}/60 contributions · {c.procedure_version}
        </span>
        <Link className="text-primary" href="/mun">
          All MUN practices
        </Link>
      </div>
      <div className="notice mb-5 text-xs leading-6">
        Practice briefs and research links are unverified. AI delegates simulate the supplied
        positions; they do not represent government policy. This is a custom three-delegate practice
        procedure.
      </div>
      {state.error && (
        <div role="alert" className="notice notice-error mb-5">
          {state.error}
          <Button size="sm" variant="outline" onClick={() => void state.load()}>
            Reload practice
          </Button>
          {state.conflict && (
            <Button size="sm" variant="outline" onClick={() => void state.recover()}>
              Replace local text with saved draft
            </Button>
          )}
        </div>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="space-y-5">
          <Card className="p-5 sm:p-7">
            <p className="eyebrow">CURRENT TOPIC</p>
            <h2 className="mt-3 text-lg font-medium">{c.topic}</h2>
            {open && (
              <p className="mt-3 text-sm text-primary">
                {c.status === 'paused'
                  ? 'Practice paused'
                  : `Speaking slot: ${speaker.country_name}${speaker.role === 'human' ? ' (you)' : ' (AI)'}`}
              </p>
            )}
            <p className="mt-3 text-xs leading-6 text-muted-foreground">
              Opening order: your country, AI delegate 1, AI delegate 2. Then discuss a caucus topic
              or negotiate with one delegate. Each AI response is requested separately; it never
              submits for you.
            </p>
          </Card>
          <Card className="p-5 sm:p-7">
            <h2 className="section-title">Committee transcript</h2>
            {detail.messages.length ? (
              <ol className="mt-5 space-y-4">
                {detail.messages.map((m) => {
                  const d = detail.delegates.find((d) => d.id === m.delegate_id)!;
                  return (
                    <li className="rounded-xl border border-border p-4" key={m.id}>
                      <p className="eyebrow">
                        {m.position + 1}. {d.country_name} ·{' '}
                        {d.role === 'human' ? 'YOU' : 'AI DELEGATE'} · {m.stage}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">{m.topic}</p>
                      {m.provider && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {m.provider} / {m.model} {m.simulated ? '· Development simulation' : ''}
                        </p>
                      )}
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">
                        {m.content}
                      </p>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Start with your opening statement. Saved contributions will appear here.
              </p>
            )}
            {c.status === 'active' && speaker.role === 'ai' && (
              <Button
                className="mt-5"
                disabled={state.busy || state.conflict || c.message_count >= 60}
                onClick={() => void ask()}
              >
                Ask {speaker.country_name} to respond
              </Button>
            )}
          </Card>
          {open && (
            <Card className="p-5 sm:p-7">
              <div className="flex justify-between gap-3">
                <h2 className="section-title">Your private draft</h2>
                <span role="status" className="text-xs text-muted-foreground">
                  Draft {state.saveState}
                </span>
              </div>
              <label className="label mt-4" htmlFor="mun-speech">
                Your contribution
              </label>
              <textarea
                id="mun-speech"
                className="field mt-2 min-h-52"
                value={state.draft}
                maxLength={6000}
                disabled={state.busy || state.conflict}
                onChange={(e) => state.setDraft(e.target.value)}
                placeholder="Write an opening, respond to a concern or propose a compromise."
              />
              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  disabled={state.busy || state.conflict}
                  onClick={() => void state.flush().catch(() => {})}
                >
                  Save MUN draft
                </Button>
                <Button
                  disabled={
                    state.busy ||
                    state.conflict ||
                    c.status !== 'active' ||
                    speaker.role !== 'human' ||
                    !state.draft.trim() ||
                    c.message_count >= 60
                  }
                  onClick={() => void submit()}
                >
                  Submit contribution
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {state.draft.length}/6000 characters. You can prepare while another delegate speaks.
                Submitted contributions are final.
              </p>
            </Card>
          )}
        </div>
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="section-title">Pinned delegation briefs</h2>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              These are the practice positions you supplied. Links are personal research notes, not
              verified citations.
            </p>
            <div className="mt-4 space-y-3">
              {detail.delegates.map((d) => (
                <details key={d.id} className="rounded-xl border border-border p-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    {d.country_name} · {d.role === 'human' ? 'You' : 'AI'}
                  </summary>
                  <p className="mt-3 whitespace-pre-wrap text-xs leading-6">{d.brief}</p>
                  <ul className="mt-3 space-y-2">
                    {d.sources.map((s, i) => (
                      <li key={i}>
                        <a
                          className="break-all text-xs text-primary"
                          href={s}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Research note {i + 1} ↗
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </Card>
          {open && (
            <Card className="p-5">
              <h2 className="section-title">Practice controls</h2>
              {c.stage !== 'opening' && (
                <div className="mt-4 space-y-4">
                  <label className="label">
                    Discussion topic
                    <textarea
                      className="field min-h-24"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      maxLength={400}
                    />
                  </label>
                  <Button
                    variant="outline"
                    disabled={
                      state.busy ||
                      c.status !== 'active' ||
                      c.current_ordinal !== 0 ||
                      topic.trim().length < 10
                    }
                    onClick={() => action('caucus')}
                  >
                    Set caucus topic
                  </Button>
                  <label className="label">
                    Negotiation partner
                    <select
                      className="field"
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                    >
                      {detail.delegates
                        .filter((d) => d.role === 'ai')
                        .map((d) => (
                          <option value={d.ordinal} key={d.id}>
                            {d.country_name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <Button
                    variant="outline"
                    disabled={
                      state.busy ||
                      c.status !== 'active' ||
                      c.current_ordinal !== 0 ||
                      topic.trim().length < 10
                    }
                    onClick={() => action('negotiate')}
                  >
                    Begin negotiation
                  </Button>
                  <p className="text-xs leading-6 text-muted-foreground">
                    Change topics or partners at your next speaking slot. Existing speeches keep
                    their original topic.
                  </p>
                </div>
              )}
              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  disabled={state.busy}
                  onClick={() => action(c.status === 'active' ? 'pause' : 'resume')}
                >
                  {c.status === 'active' ? 'Pause practice' : 'Resume practice'}
                </Button>
                <Button
                  variant="outline"
                  disabled={state.busy || !c.message_count}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Finish this practice? The saved transcript will remain available.',
                      )
                    )
                      action('finish');
                  }}
                >
                  Finish MUN practice
                </Button>
                <Button
                  variant="ghost"
                  disabled={state.busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Cancel this practice? Its saved record will remain available.',
                      )
                    )
                      action('cancel');
                  }}
                >
                  Cancel MUN practice
                </Button>
              </div>
            </Card>
          )}
          {!open && (
            <Card className="p-5">
              <h2 className="section-title">Practice saved</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Revisit the transcript and briefs here, or export your data from Profile. Review
                where your concessions found common ground, then practice with another country.
              </p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
