'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Profile } from '@verbalist/shared-types';
import { Download, ShieldCheck, Trash2 } from 'lucide-react';
import { useWorkspace } from '@/components/workspace-provider';
import { api, json } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingState, PageHeader } from '@/components/page-elements';
import { createClient } from '@/lib/supabase/client';
import { ProfileAvatar } from '@/components/profile-avatar';
export default function ProfilePage() {
  const { profile, loading } = useWorkspace();
  return (
    <>
      <PageHeader
        eyebrow="YOUR PRIVATE ACCOUNT"
        title="Profile & account"
        description="Manage your identity and stay in control of your data."
      />
      {loading ? (
        <LoadingState />
      ) : profile ? (
        <ProfileForm key={profile.version} profile={profile} />
      ) : (
        <p className="notice">Your profile could not be loaded. Retry the connection above.</p>
      )}
    </>
  );
}
function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const { reload, setApiKey } = useWorkspace();
  const [name, setName] = useState(profile.display_name),
    [username, setUsername] = useState(profile.username || ''),
    [avatar, setAvatar] = useState(profile.avatar_url || ''),
    [confirmation, setConfirmation] = useState(''),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function update(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(
        '/v1/me',
        json('PATCH', {
          display_name: name,
          username: username || null,
          avatar_url: avatar || null,
          version: profile.version,
        }),
      );
      await reload();
      setMessage('Profile saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your profile.');
    } finally {
      setBusy(false);
    }
  }
  async function exportData() {
    setBusy(true);
    setError('');
    try {
      const data = await api<unknown>('/v1/account/export');
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'verbalist-data.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Your data export has been downloaded.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  }
  async function deleteAccount(e: FormEvent) {
    e.preventDefault();
    if (confirmation !== 'DELETE') return;
    setBusy(true);
    setError('');
    try {
      await api('/v1/account', json('DELETE', { confirmation }));
      setApiKey('');
      await createClient().auth.signOut({ scope: 'local' });
      router.replace('/login');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Account deletion failed.');
      setBusy(false);
    }
  }
  return (
    <div className="max-w-3xl space-y-6">
      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      <Card className="p-6 sm:p-7">
        <div className="mb-7 flex items-center gap-4">
          <ProfileAvatar name={profile.display_name} url={profile.avatar_url} large />
          <div>
            <h2 className="section-title">Your profile</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Visible only in your private workspace.
            </p>
          </div>
        </div>
        <form onSubmit={update} className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="label">
              Display name
              <Input
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </label>
            <label className="label">
              Username{' '}
              <span className="font-normal text-muted-foreground">
                Optional · 3–30 letters, digits or underscores
              </span>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={30}
                minLength={3}
                pattern="[a-zA-Z0-9_]+"
                autoComplete="username"
              />
            </label>
          </div>
          <label className="label">
            Profile image URL{' '}
            <span className="font-normal text-muted-foreground">
              Optional · HTTPS only. Saved privately; public profile display is a later feature.
            </span>
            <Input
              type="url"
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              maxLength={1000}
              placeholder="https://…"
            />
          </label>
          <Button disabled={busy} type="submit">
            Save profile
          </Button>
        </form>
      </Card>
      <Card className="p-6 sm:p-7">
        <div className="flex gap-3">
          <ShieldCheck className="mt-1 size-5 shrink-0 text-primary" />
          <div>
            <h2 className="section-title">Your data belongs to you</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Download your profile, preferences, private sessions, and transcripts as JSON. API
              keys are never part of an export because Verbalist does not store them.
            </p>
            <Button
              variant="outline"
              className="mt-5"
              onClick={() => void exportData()}
              disabled={busy}
            >
              <Download />
              Export my data
            </Button>
          </div>
        </div>
      </Card>
      <Card className="border-destructive/25 p-6 sm:p-7">
        <h2 className="section-title text-destructive">Delete account</h2>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Permanently delete your account and all saved debates, transcripts, and preferences. This
          also deletes shared rooms and tournaments you participated in, including shared
          transcripts, results and linked practice ranking credits for all members. This cannot be
          undone. Export first if you want a copy. Sign out and sign back in immediately before
          deletion.
        </p>
        <form onSubmit={deleteAccount} className="mt-5">
          <label className="label max-w-xs">
            Type DELETE to confirm
            <Input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
              maxLength={6}
              placeholder="DELETE"
            />
          </label>
          <Button
            variant="destructive"
            className="mt-4"
            type="submit"
            disabled={confirmation !== 'DELETE' || busy}
          >
            <Trash2 />
            Permanently delete account
          </Button>
        </form>
      </Card>
    </div>
  );
}
