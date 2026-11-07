'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Check,
  Lightbulb,
  LockKeyhole,
  Shuffle,
  Sparkles,
} from 'lucide-react';
import type {
  DebateDetail,
  Difficulty,
  Motion,
  Persona,
  Preferences,
  Side,
} from '@verbalist/shared-types';
import { useApi } from '@/hooks/use-api';
import { api, json } from '@/lib/api';
import { useWorkspace } from '@/components/workspace-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ErrorState, LoadingState, PageHeader } from '@/components/page-elements';
export default function Arena() {
  const { preferences, loading } = useWorkspace();
  return (
    <>
      <PageHeader
        eyebrow="THINK ON YOUR FEET"
        title="Make your next case."
        description="Pick a motion, choose your perspective, and step into a structured debate."
      />
      {loading ? (
        <LoadingState />
      ) : preferences ? (
        <DebateSetup preferences={preferences} />
      ) : (
        <p className="notice">Connect to your account to configure a debate.</p>
      )}
    </>
  );
}
function DebateSetup({ preferences }: { preferences: Preferences }) {
  const router = useRouter(),
    { apiKey } = useWorkspace();
  const { data: motions, error, loading, reload } = useApi<Motion[]>('/v1/motions');
  const [motion, setMotion] = useState(''),
    [category, setCategory] = useState('All topics'),
    [side, setSide] = useState<Side>('proposition'),
    [difficulty, setDifficulty] = useState<Difficulty>(preferences.difficulty),
    [persona, setPersona] = useState<Persona>('analyst'),
    [prep, setPrep] = useState(60),
    [speaking, setSpeaking] = useState(120),
    [timed, setTimed] = useState(preferences.input_mode === 'voice'),
    [topic, setTopic] = useState(''),
    [busy, setBusy] = useState(false),
    [generating, setGenerating] = useState(false),
    [problem, setProblem] = useState('');
  const categories = ['All topics', ...new Set(motions?.map((m) => m.category) || [])];
  const filtered = motions?.filter((m) => category === 'All topics' || m.category === category);
  async function generate() {
    setGenerating(true);
    setProblem('');
    try {
      const result = await api<{ text: string }>(
        '/v1/motions/generate',
        json('POST', {
          topic: topic || 'current social issues',
          provider: preferences.provider,
          model: preferences.model,
        }),
        apiKey,
      );
      setMotion(result.text);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Motion generation failed.');
    } finally {
      setGenerating(false);
    }
  }
  async function start(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem('');
    try {
      const saved = await api<DebateDetail>(
        '/v1/debates',
        json('POST', {
          motion,
          side,
          difficulty,
          persona,
          preparation_seconds: prep,
          speaking_seconds: speaking,
          timed,
        }),
      );
      router.push(`/arena/${saved.session.id}`);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Unable to start this debate.');
      setBusy(false);
    }
  }
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <Card className="p-5 sm:p-7">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-xs font-semibold text-primary">
              01
            </span>
            <h2 className="section-title">Choose your motion</h2>
            <BookOpen className="ml-auto size-4 text-muted-foreground" />
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            {categories.map((item) => (
              <button
                key={item}
                onClick={() => setCategory(item)}
                className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${category === item ? 'border-primary bg-accent text-primary' : 'border-border text-muted-foreground hover:bg-accent'}`}
              >
                {item}
              </button>
            ))}
          </div>
          {loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={error} retry={() => void reload()} />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {filtered?.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setMotion(item.text)}
                  aria-pressed={motion === item.text}
                  className={`rounded-xl border p-4 text-left transition-colors ${motion === item.text ? 'border-primary bg-accent' : 'border-border hover:border-primary/40'}`}
                >
                  <span className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {item.category}
                    {motion === item.text && <Check className="size-3 text-primary" />}
                  </span>
                  <span className="mt-2 block text-xs leading-6">{item.text}</span>
                </button>
              ))}
            </div>
          )}
          <div className="mt-5 border-t border-border pt-5">
            <label className="label">
              Or bring your own motion
              <textarea
                className="field h-auto! min-h-24 leading-6"
                value={motion}
                onChange={(e) => setMotion(e.target.value)}
                maxLength={600}
                placeholder="This house would…"
              />
            </label>
          </div>
          <details className="mt-5 rounded-lg border border-dashed border-border p-4">
            <summary className="cursor-pointer text-xs font-medium text-primary">
              <Sparkles className="mr-2 inline size-3.5" />
              Generate a motion with your AI provider
            </summary>
            <div className="mt-4 flex flex-wrap gap-2">
              <Input
                className="min-w-40 flex-1"
                aria-label="Motion generation topic"
                placeholder="A topic, e.g. education"
                maxLength={200}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
              <Button variant="outline" disabled={generating} onClick={() => void generate()}>
                <Shuffle />
                {generating ? 'Generating…' : 'Generate'}
              </Button>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Uses your configured model and key. Provider charges may apply.
            </p>
          </details>
        </Card>
        <form id="debate-setup" onSubmit={start}>
          <Card className="p-5 sm:p-7">
            <div className="mb-6 flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-xs font-semibold text-primary">
                02
              </span>
              <h2 className="section-title">Set the stage</h2>
            </div>
            <fieldset>
              <legend className="mb-3 text-xs font-semibold">Your position</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {(['proposition', 'opposition'] as const).map((value) => (
                  <label
                    key={value}
                    className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${side === value ? 'border-primary bg-accent' : 'border-border'}`}
                  >
                    <input
                      type="radio"
                      name="side"
                      value={value}
                      checked={side === value}
                      onChange={() => setSide(value)}
                      className="mt-1 accent-blue-600"
                    />
                    <span>
                      <span className="block text-sm font-medium capitalize">{value}</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        {value === 'proposition'
                          ? 'Support the motion. You open the debate.'
                          : 'Challenge the motion. The AI opens.'}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <label className="label">
                Opponent difficulty
                <select
                  className="field"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                >
                  <option value="beginner">Beginner · Clear, focused counterarguments</option>
                  <option value="intermediate">Intermediate · Clashes and causal reasoning</option>
                  <option value="advanced">Advanced · Strategic impact comparison</option>
                </select>
              </label>
              <label className="label">
                Opponent persona
                <select
                  className="field"
                  value={persona}
                  onChange={(e) => setPersona(e.target.value as Persona)}
                >
                  <option value="analyst">The Analyst · Calm and precise</option>
                  <option value="socratic">The Questioner · Tests assumptions</option>
                  <option value="challenger">The Challenger · Direct and incisive</option>
                </select>
              </label>
              <label className="label">
                Preparation allowance
                <select
                  className="field"
                  value={prep}
                  onChange={(e) => setPrep(Number(e.target.value))}
                >
                  {[0, 30, 60, 120, 300].map((v) => (
                    <option key={v} value={v}>
                      {v === 0 ? 'No preparation' : `${v} seconds`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="label">
                Speaking allowance
                <select
                  className="field"
                  value={speaking}
                  onChange={(e) => setSpeaking(Number(e.target.value))}
                >
                  {[60, 120, 180, 300].map((v) => (
                    <option key={v} value={v}>
                      {v / 60} minutes per turn
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="mt-4 text-xs leading-6 text-muted-foreground">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={timed}
                  onChange={(e) => setTimed(e.target.checked)}
                  className="mt-1.5"
                />
                <span>
                  Use synchronized practice clocks. Preparation counts down automatically; start
                  each speaking period when you’re ready. Microphone capture stops at the speaking
                  allowance, and you review before submitting.
                </span>
              </label>
            </p>
          </Card>
        </form>
      </div>
      <div className="space-y-5 xl:sticky xl:top-24">
        <Card className="p-6">
          <span className="pill pill-active">QUICK DEBATE</span>
          <h2 className="mt-5 text-xl font-medium tracking-tight">
            One motion.
            <br />
            Two perspectives.
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Three rounds. Six turns. A focused exchange that makes every argument count.
          </p>
          <ol className="my-6 space-y-4">
            {['Opening case', 'Rebuttal', 'Closing statement'].map((text, i) => (
              <li className="flex items-center gap-3 text-xs" key={text}>
                <span className="flex size-6 items-center justify-center rounded-full border border-border text-[10px] text-muted-foreground">
                  {i + 1}
                </span>
                {text}
              </li>
            ))}
          </ol>
          <div className="mb-5 border-t border-border pt-4 text-xs leading-6 text-muted-foreground">
            AI provider:{' '}
            <span className="font-medium capitalize text-foreground">{preferences.provider}</span>
            <br />
            Model: {preferences.model || 'Not configured'}
            <br />
            <Link href="/settings" className="text-primary">
              Manage AI settings →
            </Link>
          </div>
          {problem && (
            <div className="notice notice-error mb-4" role="alert">
              {problem}
            </div>
          )}
          <Button
            className="w-full"
            size="lg"
            form="debate-setup"
            type="submit"
            disabled={motion.trim().length < 10 || busy}
          >
            {busy ? 'Creating debate…' : 'Start debate'}
            <ArrowRight />
          </Button>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <LockKeyhole size={12} />
            Saved privately to your account
          </p>
        </Card>
        <div className="flex gap-3 px-2">
          <Lightbulb size={17} className="mt-1 shrink-0 text-primary" />
          <p className="text-xs leading-6 text-muted-foreground">
            Try the side you disagree with. Understanding a different position is part of building
            your own.
          </p>
        </div>
      </div>
    </div>
  );
}
