'use client';
import { useState, type FormEvent } from 'react';
import type { Preferences, ProviderId, ProviderInfo } from '@verbalist/shared-types';
import { Check, KeyRound, ShieldCheck, Trash2 } from 'lucide-react';
import { useWorkspace } from '@/components/workspace-provider';
import { useApi } from '@/hooks/use-api';
import { api, json } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingState, PageHeader } from '@/components/page-elements';
import { useBrowserVoices, useSpeechSupport } from '@/hooks/use-audio';
export default function Settings() {
  const { preferences, loading } = useWorkspace();
  return (
    <>
      <PageHeader
        eyebrow="MAKE THIS SPACE YOURS"
        title="Settings"
        description="Choose how you practice and which model takes the other side."
      />
      {loading ? (
        <LoadingState />
      ) : preferences ? (
        <SettingsForm key={preferences.version} preferences={preferences} />
      ) : (
        <p className="notice">
          Your account preferences could not be loaded. Retry the connection above.
        </p>
      )}
    </>
  );
}
function SettingsForm({ preferences }: { preferences: Preferences }) {
  const { apiKey, setApiKey, reload } = useWorkspace(),
    { data: providers } = useApi<ProviderInfo[]>('/v1/providers');
  const [provider, setProvider] = useState<ProviderId>(preferences.provider),
    [model, setModel] = useState(preferences.model),
    [key, setKey] = useState(''),
    [theme, setTheme] = useState(preferences.theme),
    [difficulty, setDifficulty] = useState(preferences.difficulty),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const [inputMode, setInputMode] = useState(preferences.input_mode),
    [outputMode, setOutputMode] = useState(preferences.output_mode),
    [language, setLanguage] = useState(preferences.speech_language || 'en-US'),
    [rate, setRate] = useState(preferences.speech_rate || 1),
    [voice, setVoice] = useState(preferences.speech_voice || '');
  const voices = useBrowserVoices(),
    support = useSpeechSupport();
  const selected = providers?.find((p) => p.id === provider);
  function switchProvider(value: ProviderId) {
    setProvider(value);
    setModel(providers?.find((p) => p.id === value)?.suggested_model || '');
    setKey('');
    setApiKey('');
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api<Preferences>(
        '/v1/preferences',
        json('PATCH', {
          theme,
          provider,
          model,
          difficulty,
          input_mode: inputMode,
          output_mode: outputMode,
          speech_language: language,
          speech_rate: rate,
          speech_voice: voice,
          version: preferences.version,
        }),
      );
      if (key.trim()) setApiKey(key.trim());
      setKey('');
      setMessage('Preferences saved to your account.');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Settings could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  function useKey() {
    setApiKey(key.trim());
    setKey('');
    setMessage(
      'Credential set for this active page session. It will be cleared on reload or sign-out.',
    );
  }
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_310px]">
      <form onSubmit={submit} aria-busy={busy}>
        <fieldset disabled={busy} className="space-y-6 min-w-0">
          <Card className="p-6 sm:p-7">
            <div className="mb-6 flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-primary">
                <KeyRound size={18} />
              </span>
              <div>
                <h2 className="section-title">AI provider</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Your account, your model, your usage.
                </p>
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="label">
                Provider
                <select
                  className="field"
                  value={provider}
                  onChange={(e) => switchProvider(e.target.value as ProviderId)}
                >
                  {providers ? (
                    providers.map((p) => (
                      <option key={p.id} value={p.id} disabled={!p.enabled}>
                        {p.name}
                        {!p.enabled ? ' · Operator setup required' : ''}
                      </option>
                    ))
                  ) : (
                    <option value={provider}>{provider}</option>
                  )}
                </select>
              </label>
              <label className="label">
                Model identifier
                <Input
                  required
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  maxLength={160}
                  pattern={'[a-zA-Z0-9._:\\/\\-]+'}
                  placeholder={
                    provider === 'local' ? 'e.g. llama3.2' : 'Enter an available model ID'
                  }
                />
              </label>
            </div>
            {selected && (
              <p className="mt-4 text-xs leading-6 text-muted-foreground">{selected.note}</p>
            )}
            <div className="mt-6 border-t border-border pt-5">
              <div className="mb-4 flex flex-wrap gap-2">
                <span className="pill pill-active">Text generation</span>
                <span className="pill pill-active">Streaming text</span>
                <span className="pill">Browser voice</span>
              </div>
              <p className="text-xs leading-6 text-muted-foreground">
                Model replies support live text streaming with a standard-response fallback. Browser
                speech handles voice independently of your AI provider. Choose a model with at least
                32k context for full-length debates.
              </p>
            </div>
          </Card>
          <Card className="p-6 sm:p-7">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="section-title">Session credential</h2>
              <span className={`pill ${apiKey ? 'pill-active' : ''}`}>
                {apiKey ? 'Set for this session' : 'No key held'}
              </span>
            </div>
            <label className="label">
              Your API key
              <Input
                type="password"
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                spellCheck={false}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                maxLength={4096}
                placeholder={
                  selected?.requires_key === false
                    ? 'Not required for this provider'
                    : 'Paste your own provider key'
                }
                disabled={selected?.requires_key === false}
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!key.trim() || selected?.requires_key === false}
                onClick={useKey}
              >
                <Check />
                Use for this session
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setKey('');
                  setApiKey('');
                  setMessage('Credentials cleared immediately.');
                }}
              >
                <Trash2 />
                Clear credentials
              </Button>
            </div>
            <p className="mt-4 text-xs leading-6 text-muted-foreground">
              Kept only in this app’s memory while you’re signed in. Sent to the backend over HTTPS
              for provider requests. Never saved with your preferences or debate history. Re-enter
              after a reload. Changing providers clears the current key.
            </p>
          </Card>
          <Card className="p-6 sm:p-7">
            <h2 className="section-title mb-6">Practice preferences</h2>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="label">
                Appearance
                <select
                  className="field"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as Preferences['theme'])}
                >
                  <option value="system">Follow device</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <label className="label">
                Default difficulty
                <select
                  className="field"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Preferences['difficulty'])}
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </label>
            </div>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <label className="label">
                Preferred input
                <select
                  className="field"
                  value={inputMode}
                  onChange={(e) => setInputMode(e.target.value as Preferences['input_mode'])}
                >
                  <option value="text">Text</option>
                  <option value="voice">Voice with editable transcript</option>
                </select>
              </label>
              <label className="label">
                Preferred output
                <select
                  className="field"
                  value={outputMode}
                  onChange={(e) => setOutputMode(e.target.value as Preferences['output_mode'])}
                >
                  <option value="text">Text</option>
                  <option value="voice">Voice, with transcript available</option>
                  <option value="both">Text and voice</option>
                </select>
              </label>
              <label className="label">
                Speech language
                <select
                  className="field"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  {[
                    ['en-US', 'English (US)'],
                    ['en-GB', 'English (UK)'],
                    ['en-SG', 'English (Singapore)'],
                    ['en-AU', 'English (Australia)'],
                    ['es-ES', 'Spanish'],
                    ['fr-FR', 'French'],
                    ['de-DE', 'German'],
                    ['hi-IN', 'Hindi'],
                  ].map(([code, label]) => (
                    <option value={code} key={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="label">
                Playback speed
                <select
                  className="field"
                  value={rate}
                  onChange={(e) => setRate(Number(e.target.value))}
                >
                  {[0.75, 1, 1.25, 1.5].map((value) => (
                    <option key={value} value={value}>
                      {value}×
                    </option>
                  ))}
                </select>
              </label>
              <label className="label sm:col-span-2">
                Playback voice
                <select className="field" value={voice} onChange={(e) => setVoice(e.target.value)}>
                  <option value="">System voice for selected language</option>
                  {voice && !voices.some((item) => item.voiceURI === voice) && (
                    <option value={voice}>Saved voice unavailable here — system fallback</option>
                  )}
                  {voices.map((item) => (
                    <option key={item.voiceURI} value={item.voiceURI}>
                      {item.name} · {item.lang}
                      {item.localService ? ' · On device' : ' · Online service'}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-5 rounded-lg bg-background p-4 text-xs leading-6 text-muted-foreground">
              This browser:{' '}
              {support.recognition
                ? 'speech recognition available'
                : 'speech recognition unavailable — text fallback'}
              ; {support.synthesis ? 'speech playback available' : 'text output fallback'}. Browser
              speech may use an online service. Microphone access requires permission and explicit
              consent in the arena. Audio saving is off by default and chosen separately for each
              take; optional files download to your device, without uploading.
            </div>
          </Card>
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
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save preferences'}
          </Button>
        </fieldset>
      </form>
      <Card className="p-6">
        <ShieldCheck className="mb-4 text-primary" size={24} />
        <h2 className="section-title">A few things to know</h2>
        <ul className="mt-4 space-y-4 text-xs leading-6 text-muted-foreground">
          <li>
            Cloud providers may charge your API account. A ChatGPT or Claude subscription does not
            necessarily include API usage.
          </li>
          <li>
            Local models require installation and enough memory on the machine running the FastAPI
            backend.
          </li>
          <li>
            A hosted backend’s localhost refers to that server. It cannot reach your laptop’s local
            model automatically.
          </li>
          <li>
            Debate transcripts are sent to your chosen model. Review the provider’s data policies
            before sharing sensitive content.
          </li>
          <li>Provider keys never synchronize across devices.</li>
        </ul>
      </Card>
    </div>
  );
}
