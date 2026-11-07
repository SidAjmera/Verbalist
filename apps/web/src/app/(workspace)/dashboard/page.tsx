'use client';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CheckCheck,
  Flame,
  Layers3,
  MessageSquare,
  Sparkles,
  Swords,
} from 'lucide-react';
import type { DashboardData } from '@verbalist/shared-types';
import { useApi } from '@/hooks/use-api';
import { useWorkspace } from '@/components/workspace-provider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LearningSummary } from '@/components/learning-summary';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  SessionList,
  StatCard,
} from '@/components/page-elements';
export default function Dashboard() {
  const { profile } = useWorkspace();
  const { data, error, loading, reload } = useApi<DashboardData>('/v1/dashboard');
  return (
    <>
      <PageHeader
        eyebrow="YOUR DEBATE WORKSPACE"
        title={`Welcome back${profile?.display_name && profile.display_name !== 'Debater' ? `, ${profile.display_name}` : ''}.`}
        description="Every perspective is a chance to think a little deeper."
        action={
          <Button asChild>
            <Link href="/arena">
              <Swords />
              New debate
            </Link>
          </Button>
        }
      />
      <section className="relative mb-7 overflow-hidden rounded-2xl border border-blue-500/30 bg-[radial-gradient(ellipse_at_top_right,#12316a,#040913_70%)] px-6 py-8 text-white sm:px-8 sm:py-9">
        <div className="pointer-events-none absolute -right-16 -top-16 size-80 rounded-full border border-white/10 shadow-[0_0_0_45px_#ffffff04,0_0_0_90px_#ffffff03]" />
        <div className="relative grid items-center gap-7 md:grid-cols-[1fr_auto]">
          <div>
            <span className="mb-4 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[.14em] text-blue-200">
              <span className="size-1.5 rounded-full bg-blue-300" />
              THE FLOOR IS YOURS
            </span>
            <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">
              A stronger argument starts
              <br className="hidden sm:block" /> with a different perspective.
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-6 text-slate-300">
              Choose a motion. Challenge an AI opponent. Build a case you can stand behind.
            </p>
          </div>
          <Button
            asChild
            className="w-fit border border-white/20 bg-white text-[#182c4a] hover:bg-blue-100"
          >
            <Link href="/arena">
              Enter the arena
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>
      <LearningSummary />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} retry={() => void reload()} />
      ) : (
        data && (
          <>
            <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Debates completed"
                value={data.completed}
                detail="Every completed conversation counts"
                icon={<CheckCheck size={17} />}
              />
              <StatCard
                label="Practice streak"
                value={`${data.streak} ${data.streak === 1 ? 'day' : 'days'}`}
                detail="Consecutive completion days · UTC"
                icon={<Flame size={17} />}
              />
              <StatCard
                label="Arguments delivered"
                value={data.total_turns}
                detail="Your saved speaking turns"
                icon={<MessageSquare size={17} />}
              />
              <StatCard
                label="Ready to resume"
                value={data.active}
                detail="Your active and paused debates"
                icon={<Layers3 size={17} />}
              />
            </section>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_310px]">
              <Card>
                <div className="flex items-center justify-between border-b border-border p-6">
                  <h2 className="section-title">Recent debates</h2>
                  <Link
                    href="/history"
                    className="flex items-center gap-1.5 text-xs font-medium text-primary"
                  >
                    View history
                    <ArrowUpRight size={14} />
                  </Link>
                </div>
                {data.recent.length ? <SessionList sessions={data.recent} /> : <EmptyState />}
              </Card>
              <div className="space-y-5">
                <Card className="p-6">
                  <span className="mb-4 flex size-9 items-center justify-center rounded-lg bg-accent text-primary">
                    <BookOpen size={18} />
                  </span>
                  <h2 className="section-title">A case worth making</h2>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    Start with a claim. Explain how it works. Show why the impact matters.
                  </p>
                  <div className="mt-5 space-y-3">
                    {[
                      'Make your position clear',
                      'Connect reasons to outcomes',
                      'Respond to the strongest objection',
                    ].map((text, i) => (
                      <p key={text} className="flex gap-3 text-xs leading-5">
                        <span className="font-semibold text-primary">0{i + 1}</span>
                        {text}
                      </p>
                    ))}
                  </div>
                </Card>
                <Card className="border-dashed p-5">
                  <div className="flex gap-3">
                    <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div>
                      <h3 className="text-xs font-semibold">Your model. Your choice.</h3>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        Connect your own cloud API key or a model running on your API host.
                      </p>
                      <Link
                        href="/settings"
                        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary"
                      >
                        Configure AI
                        <ArrowRight size={13} />
                      </Link>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </>
        )
      )}
    </>
  );
}
