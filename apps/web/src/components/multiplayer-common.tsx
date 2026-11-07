'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { InvitationMeta } from '@verbalist/shared-types';
import { api, json } from '@/lib/api';
import { Button } from './ui/button';
import { Card } from './ui/card';
export function JoinInvitation() {
  const router = useRouter();
  const [code, setCode] = useState(''),
    [alias, setAlias] = useState(''),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function join(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const value = await api<{ kind: string; id: string }>(
        '/v1/invitations/accept',
        json('POST', { code: code.trim(), alias, consent }),
      );
      setCode('');
      router.push(`/${value.kind === 'room' ? 'rooms' : 'tournaments'}/${value.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invitation could not be accepted.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="p-6">
      <h2 className="section-title">Have an invitation?</h2>
      <form onSubmit={join} className="mt-4 space-y-4">
        <label className="label">
          Invitation code
          <input
            className="field"
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            autoComplete="off"
            minLength={43}
            maxLength={43}
          />
        </label>
        <label className="label">
          Your room alias
          <input
            className="field"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            required
            minLength={2}
            maxLength={40}
          />
        </label>
        <label className="flex gap-3 text-sm leading-6">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            required
          />
          I agree to share my alias, submitted transcript and results with room or tournament
          members. Live voice is a separate choice.
        </label>
        {error && (
          <p role="alert" className="notice notice-error">
            {error}
          </p>
        )}
        <Button disabled={busy || !consent}>Join with invitation</Button>
      </form>
    </Card>
  );
}
export function Invitations({
  path,
  roles,
  invites,
  reload,
  revoke,
}: {
  path: string;
  roles: string[];
  invites: InvitationMeta[];
  reload: () => void;
  revoke: (id: string) => void;
}) {
  const [role, setRole] = useState(roles[0]),
    [code, setCode] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false);
  async function create() {
    setBusy(true);
    setError('');
    try {
      const value = await api<{ code: string }>(path, json('POST', { role, minutes: 1440 }));
      setCode(value.code);
      setCopied(false);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invitation unavailable.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-xl border border-border p-4">
      <summary className="cursor-pointer font-medium">Private invitations</summary>
      <p className="my-3 text-xs leading-6 text-muted-foreground">
        Codes expire after 24 hours. Room codes admit one account; entrant codes stop at the event
        capacity. Share only with your intended guest. Codes are shown once and are never put in
        URLs.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="label">
          Invitation role
          <select className="field" value={role} onChange={(e) => setRole(e.target.value)}>
            {roles.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <Button variant="outline" disabled={busy} onClick={() => void create()}>
          Create invitation
        </Button>
      </div>
      {code && (
        <div className="mt-3 space-y-2">
          <label className="label">
            New invitation code
            <input
              className="field font-mono"
              value={code}
              readOnly
              onFocus={(e) => e.target.select()}
            />
          </label>
          <Button
            size="sm"
            onClick={() =>
              void navigator.clipboard.writeText(code).then(
                () => setCopied(true),
                () => setError('Select and copy the code manually.'),
              )
            }
          >
            {copied ? 'Copied' : 'Copy invitation code'}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="notice notice-error mt-3">
          {error}
        </p>
      )}
      <ul className="mt-4 space-y-2 text-xs">
        {invites.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-2">
            {i.role} · {i.uses}/{i.max_uses} used ·{' '}
            {i.revoked ? 'revoked' : new Date(i.expires_at).toLocaleString()}
            {!i.revoked && (
              <Button size="sm" variant="ghost" onClick={() => revoke(i.id)}>
                Revoke {i.role} invitation
              </Button>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
export function TimingFields() {
  return (
    <div className="grid grid-cols-2 gap-4">
      <label className="label">
        Preparation seconds
        <input
          className="field"
          name="preparation_seconds"
          type="number"
          min={0}
          max={900}
          defaultValue={60}
          required
        />
      </label>
      <label className="label">
        Speaking seconds
        <input
          className="field"
          name="speaking_seconds"
          type="number"
          min={30}
          max={600}
          defaultValue={120}
          required
        />
      </label>
    </div>
  );
}
