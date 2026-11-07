'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import type { Preferences, Profile, ProviderConfig } from '@verbalist/shared-types';
import { api } from '@/lib/api';
import { createClient } from '@/lib/supabase/client';
interface Workspace {
  profile: Profile | null;
  preferences: Preferences | null;
  loading: boolean;
  error: string;
  apiKey: string;
  setApiKey: (key: string) => void;
  reload: () => Promise<void>;
  provider: ProviderConfig | null;
}
const Context = createContext<Workspace | null>(null);
export function WorkspaceProvider({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId: string;
}) {
  const [profile, setProfile] = useState<Profile | null>(null),
    [preferences, setPreferences] = useState<Preferences | null>(null);
  const [apiKey, setApiKey] = useState(''),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const { setTheme } = useTheme();
  const router = useRouter();
  const reload = useCallback(
    () =>
      Promise.all([api<Profile>('/v1/me'), api<Preferences>('/v1/preferences')]).then(
        ([p, pr]) => {
          setProfile(p);
          setPreferences(pr);
          setTheme(pr.theme);
          setError('');
          setLoading(false);
        },
        (e) => {
          setError(e instanceof Error ? e.message : 'Unable to load your account.');
          setLoading(false);
        },
      ),
    [setTheme],
  );
  useEffect(() => {
    void reload();
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (session && session.user.id !== userId)) {
        setApiKey('');
        router.replace('/login');
        router.refresh();
      }
    });
    return () => subscription.unsubscribe();
  }, [reload, userId, router]);
  return (
    <Context.Provider
      value={{
        profile,
        preferences,
        loading,
        error,
        apiKey,
        setApiKey,
        reload,
        provider: preferences ? { provider: preferences.provider, model: preferences.model } : null,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error('Workspace provider is required');
  return value;
}
