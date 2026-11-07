'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Check,
  LockKeyhole,
  MessageSquareQuote,
  ShieldCheck,
  Swords,
} from 'lucide-react';
import { Brand } from './brand';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { configured, createClient } from '@/lib/supabase/client';
type Mode = 'login' | 'register' | 'forgot' | 'reset';
export function AuthForm({
  reset = false,
  initialError = '',
}: {
  reset?: boolean;
  initialError?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(reset ? 'reset' : 'login'),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(initialError);
  const ready = configured();
  function changeMode(next: Mode) {
    setMode(next);
    setError('');
    setMessage('');
    setPassword('');
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const supabase = createClient();
      const origin = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error)
          throw new Error('Unable to sign in. Check your email, password, and email verification.');
        router.replace('/dashboard');
        router.refresh();
      } else if (mode === 'register') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${origin}/auth/callback` },
        });
        if (error)
          throw new Error(
            'Registration could not be completed. Check the password requirements or try again later.',
          );
        if (data.session) {
          await supabase.auth.signOut();
        }
        setMessage('Check your inbox for a confirmation link. Verify your email, then sign in.');
        setPassword('');
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${origin}/auth/callback?next=/reset-password`,
        });
        if (error) throw new Error('The reset request could not be sent. Please try again later.');
        setMessage('If an account exists for this email, a reset link will arrive shortly.');
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error)
          throw new Error(
            'This reset session is invalid or expired. Request a new password reset link.',
          );
        setMessage('Your password has been updated. You can return to your workspace.');
        setPassword('');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Authentication is unavailable. Try again.');
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setBusy(true);
    setError('');
    const { error } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError('Google sign-in is unavailable. Check the provider configuration or use email.');
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <Brand light />
        <div className="relative z-10 my-auto py-16">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-xs text-blue-100">
            <span className="size-1.5 rounded-full bg-blue-300" />A stronger point of view starts
            here
          </div>
          <h1 className="max-w-xl text-5xl font-medium leading-[1.13] tracking-[-0.045em] sm:text-6xl">
            Find your voice.
            <br />
            <span className="text-blue-300">Make your case.</span>
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-slate-300">
            A dedicated space to challenge your assumptions, sharpen your reasoning, and become a
            more confident debater.
          </p>
          <div className="mt-10 flex flex-wrap gap-6 text-sm text-slate-200">
            <span className="flex items-center gap-2">
              <Swords size={17} className="text-blue-300" />
              Structured practice
            </span>
            <span className="flex items-center gap-2">
              <ShieldCheck size={17} className="text-blue-300" />
              Private by default
            </span>
          </div>
          <div className="mt-14 max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
            <MessageSquareQuote className="mb-4 text-blue-300" size={25} />
            <p className="text-lg leading-7 tracking-tight">
              The goal is a clearer argument.
              <br />
              The progress is yours to make.
            </p>
            <p className="mt-4 text-xs font-medium tracking-[.14em] text-slate-400">
              THINK CLEARLY. SPEAK WITH PURPOSE.
            </p>
          </div>
        </div>
        <p className="relative z-10 text-xs text-slate-400">
          VERBALIST / YOUR PERSONAL DEBATE WORKSPACE
        </p>
      </section>
      <section className="flex min-h-screen items-center justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-[390px]">
          <div className="mb-12 lg:hidden">
            <Brand />
          </div>
          <span className="eyebrow">YOUR NEXT GOOD ARGUMENT</span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            {mode === 'login'
              ? 'Welcome to Verbalist'
              : mode === 'register'
                ? 'Create your account'
                : mode === 'forgot'
                  ? 'Reset your password'
                  : 'Choose a new password'}
          </h2>
          <p className="mt-3 mb-8 text-sm leading-6 text-muted-foreground">
            {mode === 'login'
              ? 'Sign in to your private debate workspace.'
              : mode === 'register'
                ? 'Build better arguments, one conversation at a time.'
                : mode === 'forgot'
                  ? 'We’ll email you a link to get back into your account.'
                  : 'Use at least 12 characters for your new password.'}
          </p>
          {!ready && (
            <div className="notice mb-6" role="status">
              <strong>Connect Supabase to get started</strong>
              <p className="mt-1">
                Add the environment values in <code>apps/web/.env.local</code> and start the FastAPI
                backend. Setup details are in the project README. Accounts are required for all
                debates.
              </p>
            </div>
          )}
          {error && (
            <div className="notice notice-error mb-5" role="alert">
              {error}
            </div>
          )}
          {message && (
            <div className="notice mb-5 flex gap-2" role="status">
              <Check className="size-4 shrink-0" />
              {message}
            </div>
          )}
          {(mode === 'login' || mode === 'register') && (
            <>
              <Button
                variant="outline"
                className="w-full"
                disabled={!ready || busy}
                onClick={() => void google()}
              >
                <span className="font-bold text-blue-600">G</span>Continue with Google
              </Button>
              <div className="my-6 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or continue with email
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          )}
          <form onSubmit={submit} className="space-y-5">
            {mode !== 'reset' && (
              <label className="label">
                Email address
                <Input
                  autoComplete="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={254}
                />
              </label>
            )}
            {mode !== 'forgot' && (
              <label className="label">
                Password
                <Input
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder={mode === 'login' ? 'Enter your password' : 'At least 12 characters'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={mode === 'login' ? 1 : 12}
                  maxLength={128}
                  required
                />
              </label>
            )}
            {mode === 'login' && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => changeMode('forgot')}
                  className="text-xs font-medium text-primary"
                >
                  Forgot password?
                </button>
              </div>
            )}
            <Button className="w-full" size="lg" type="submit" disabled={!ready || busy}>
              {busy
                ? 'Please wait…'
                : mode === 'login'
                  ? 'Sign in'
                  : mode === 'register'
                    ? 'Create account'
                    : mode === 'forgot'
                      ? 'Send reset link'
                      : 'Update password'}
              <ArrowRight />
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === 'login' ? (
              <>
                New to Verbalist?{' '}
                <button className="font-medium text-primary" onClick={() => changeMode('register')}>
                  Create an account
                </button>
              </>
            ) : mode === 'reset' ? (
              <a href="/dashboard" className="font-medium text-primary">
                Return to workspace
              </a>
            ) : (
              <button className="font-medium text-primary" onClick={() => changeMode('login')}>
                Back to sign in
              </button>
            )}
          </p>
          <p className="mt-12 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <LockKeyhole size={13} />
            Your debates stay in your private account.
          </p>
        </div>
      </section>
    </div>
  );
}
