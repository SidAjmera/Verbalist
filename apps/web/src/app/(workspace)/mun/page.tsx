'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { MUNCatalog, MUNCommittee, MUNDetail } from '@verbalist/shared-types';
import { api, json } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader, LoadingState, ErrorState } from '@/components/page-elements';
export default function MUN() {
  const catalog = useApi<MUNCatalog>('/v1/mun/catalog');
  const [offset, setOffset] = useState(0);
  const history = useApi<MUNCommittee[]>(`/v1/mun?offset=${offset}`);
  return (
    <>
      <PageHeader
        eyebrow="DIPLOMACY THROUGH PRACTICE"
        title="Model United Nations"
        description="Prepare a position, listen to other delegates and negotiate a concrete compromise."
      />
      {catalog.loading ? (
        <LoadingState />
      ) : catalog.error ? (
        <ErrorState message={catalog.error} retry={() => void catalog.reload()} />
      ) : (
        catalog.data && <CreatePractice catalog={catalog.data} />
      )}
      <Card className="mt-6 p-6">
        <h2 className="section-title">Your MUN practices</h2>
        {history.loading ? (
          <LoadingState />
        ) : history.error ? (
          <ErrorState message={history.error} retry={() => void history.reload()} />
        ) : history.data?.length ? (
          <div className="mt-4 divide-y divide-border">
            {history.data.map((c) => (
              <Link
                key={c.id}
                href={`/mun/${c.id}`}
                className="flex flex-wrap justify-between gap-3 py-4 hover:text-primary"
              >
                <span className="min-w-0 font-medium">
                  {c.agenda}
                  <span className="mt-2 block text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString()} · {c.message_count} contributions
                    · {c.stage}
                  </span>
                </span>
                <span className="badge">{c.status}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Your private committee transcripts will appear here.
          </p>
        )}
        <div className="mt-5 flex gap-3">
          <Button
            variant="outline"
            disabled={!offset}
            onClick={() => setOffset(Math.max(0, offset - 30))}
          >
            Previous practices
          </Button>
          <Button
            variant="outline"
            disabled={(history.data?.length || 0) < 30}
            onClick={() => setOffset(offset + 30)}
          >
            More practices
          </Button>
        </div>
      </Card>
    </>
  );
}
function CreatePractice({ catalog }: { catalog: MUNCatalog }) {
  const router = useRouter();
  const [committee, setCommittee] = useState(catalog.committees[0].id),
    [agenda, setAgenda] = useState(catalog.committees[0].agenda),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const value = await api<MUNDetail>(
        '/v1/mun',
        json('POST', {
          committee_key: committee,
          agenda,
          delegates: [0, 1, 2].map((i) => ({
            country_code: form.get(`country-${i}`),
            brief: form.get(`brief-${i}`),
            sources: String(form.get(`sources-${i}`) || '')
              .split('\n')
              .map((v) => v.trim())
              .filter(Boolean),
          })),
        }),
      );
      router.push(`/mun/${value.committee.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create practice.');
      setBusy(false);
    }
  }
  return (
    <Card className="p-5 sm:p-7">
      <h2 className="section-title">Set up a private committee</h2>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        One human delegate and two AI delegates. You supply each practice brief; it stays fixed
        throughout the session. These notes and links are unverified, and AI delegates do not speak
        for real governments.
      </p>
      <a
        className="mt-3 inline-block text-xs text-primary"
        href="https://ask.un.org/faq/418224"
        target="_blank"
        rel="noopener noreferrer"
      >
        UN library guide: research a country’s position ↗
      </a>
      <form onSubmit={submit} className="mt-6 space-y-5">
        <div className="grid gap-5 md:grid-cols-2">
          <label className="label">
            Committee
            <select
              className="field"
              value={committee}
              onChange={(e) => {
                setCommittee(e.target.value);
                setAgenda(catalog.committees.find((c) => c.id === e.target.value)!.agenda);
              }}
            >
              {catalog.committees.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="label">
            Agenda
            <textarea
              className="field min-h-24"
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              minLength={10}
              maxLength={600}
              required
            />
          </label>
        </div>
        <div className="grid gap-5 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <fieldset className="min-w-0 space-y-4 rounded-xl border border-border p-4" key={i}>
              <legend className="px-2 text-sm font-medium">
                {i === 0 ? 'Your delegation' : `AI delegate ${i}`}
              </legend>
              <label className="label">
                {i === 0 ? 'Your country' : `AI country ${i}`}
                <select
                  className="field"
                  name={`country-${i}`}
                  defaultValue={['SG', 'IN', 'KE'][i]}
                >
                  {catalog.countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="label">
                {i === 0 ? 'Your practice brief' : `AI practice brief ${i}`}
                <textarea
                  className="field min-h-44"
                  name={`brief-${i}`}
                  minLength={20}
                  maxLength={2000}
                  required
                  placeholder="State the position, priorities, reasons and possible concessions for this simulation."
                />
              </label>
              <label className="label">
                {i === 0 ? 'Your research links' : `AI research links ${i}`}
                <textarea
                  className="field min-h-24"
                  name={`sources-${i}`}
                  maxLength={6002}
                  placeholder="Optional: up to 3 public HTTPS links, one per line."
                />
              </label>
            </fieldset>
          ))}
        </div>
        <p className="text-xs leading-6 text-muted-foreground">
          {catalog.procedure} This starter uses text input. It does not verify country positions or
          follow an official conference rulebook. AI responses use your Settings provider and may
          incur provider charges.
        </p>
        {error && (
          <p role="alert" className="notice notice-error">
            {error}
          </p>
        )}
        <Button disabled={busy}>Create MUN practice</Button>
      </form>
    </Card>
  );
}
