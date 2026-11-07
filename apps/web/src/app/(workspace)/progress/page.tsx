'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Award, CheckCheck, Flame, Target } from 'lucide-react';
import { SKILLS, type DashboardData, type LearningProgress } from '@verbalist/shared-types';
import { useApi } from '@/hooks/use-api';
import { learningSummary, skillDrills, achievementInfo } from '@/lib/learning';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState, PageHeader, StatCard } from '@/components/page-elements';
const LearningChart = dynamic(() => import('@/components/learning-chart'), {
  ssr: false,
  loading: () => <p className="notice mt-4">Loading your score chart…</p>,
});
export default function Progress() {
  const progress = useApi<LearningProgress>('/v1/learning/progress'),
    activity = useApi<DashboardData>('/v1/dashboard');
  const data = progress.data,
    summary = data ? learningSummary(data) : null;
  return (
    <>
      <PageHeader
        eyebrow="REFLECT. PRACTICE. REPEAT."
        title="Your progress"
        description="Trace your skills through saved evaluations and focused practice."
      />
      {progress.loading || activity.loading ? (
        <LoadingState />
      ) : progress.error || activity.error ? (
        <ErrorState
          message={progress.error || activity.error}
          retry={() => {
            void progress.reload();
            void activity.reload();
          }}
        />
      ) : (
        data &&
        activity.data &&
        summary && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Completed debates"
                value={activity.data.completed}
                detail="Saved practice conversations"
                icon={<CheckCheck size={18} />}
              />
              <StatCard
                label="Advisory average"
                value={summary.average === null ? '—' : `${summary.average.toFixed(1)}/100`}
                detail={`${data.evaluated} nonsimulated evaluations`}
                icon={<Target size={18} />}
              />
              <StatCard
                label="Current streak"
                value={`${activity.data.streak} days`}
                detail="UTC debate completion dates"
                icon={<Flame size={18} />}
              />
              <StatCard
                label="Practice drills"
                value={data.drill_count}
                detail="Nonsimulated feedback only"
                icon={<Award size={18} />}
              />
            </div>
            <Card className="mt-6 p-6 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h2 className="section-title">Skill trends</h2>
                <span className="pill">Quick Debate · quick-v1</span>
              </div>
              <p className="mt-3 text-xs leading-6 text-muted-foreground">
                Latest evaluation per completed debate. Advisory scores can vary by model and are
                not official rankings. The chart shows your latest 30 evaluated debates; averages
                include every evaluated debate. Formats practiced:{' '}
                {activity.data.practiced_formats.length ? 'Quick Debate' : 'None yet'}.
              </p>
              {data.trend.length ? (
                <>
                  <LearningChart trend={data.trend} />
                  <details className="mt-5">
                    <summary className="cursor-pointer text-xs text-primary">
                      Score data & model provenance
                    </summary>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[480px] text-left text-xs">
                        <caption className="mb-3 text-left text-muted-foreground">
                          Latest advisory evaluation per debate, ordered by debate completion.
                        </caption>
                        <thead>
                          <tr className="border-b border-border">
                            <th className="p-3">Completed</th>
                            <th className="p-3">Score</th>
                            {SKILLS.map((skill) => (
                              <th key={skill} className="p-3 capitalize">
                                {skill}
                              </th>
                            ))}
                            <th className="p-3">Model</th>
                            <th className="p-3">Review</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.trend.map((item) => (
                            <tr className="border-b border-border" key={item.id}>
                              <td className="p-3">
                                {new Date(item.completed_at).toLocaleDateString()}
                              </td>
                              <td className="p-3">{item.human_total}/100</td>
                              {SKILLS.map((skill) => (
                                <td key={skill} className="p-3">
                                  {item.skills[skill].score}/10
                                </td>
                              ))}
                              <td className="p-3">
                                {item.provider}/{item.model}
                              </td>
                              <td className="p-3">
                                <Link
                                  className="text-primary"
                                  href={`/arena/${item.session_id}?review=${item.id}`}
                                >
                                  Open debate
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                  <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {SKILLS.map((skill) => (
                      <div key={skill} className="rounded-xl bg-background p-4">
                        <p className="text-xs font-medium capitalize">{skill}</p>
                        <p className="mt-3 text-xl text-primary">
                          {data.skills[skill]?.toFixed(1) ?? '—'}{' '}
                          <span className="text-xs text-muted-foreground">/ 10</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="py-10 text-center">
                  <p className="text-lg font-medium">Your first evaluation starts the story.</p>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Finish a debate and generate an evaluation with a real model to see your skills
                    here.
                  </p>
                  <Button asChild variant="outline" className="mt-5">
                    <Link href="/history">Review saved debates</Link>
                  </Button>
                </div>
              )}
              {data.simulated_reviews > 0 && (
                <p className="notice mt-4">
                  {data.simulated_reviews} development simulation review(s) excluded from score
                  averages, trends and evaluation achievements.
                </p>
              )}
            </Card>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <Card className="p-6">
                <h2 className="section-title">Build your next skill</h2>
                {summary.focuses.length ? (
                  <>
                    <p className="mt-3 text-xs leading-6 text-muted-foreground">
                      Recommended from your lowest average skill scores.
                    </p>
                    <div className="mt-4 space-y-3">
                      {summary.focuses.slice(0, 2).map((skill) => (
                        <Link
                          key={skill}
                          href={`/practice?drill=${skillDrills[skill]}`}
                          className="flex items-center justify-between rounded-xl border border-border p-4 text-sm"
                        >
                          <span className="capitalize">Practice {skill}</span>
                          <span className="text-primary">Open drill →</span>
                        </Link>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="mt-4 text-sm leading-7 text-muted-foreground">
                    Until you have an evaluation, try a general mechanism or rebuttal drill.
                    Personalized recommendations will appear from your saved scores.
                  </p>
                )}
                <h3 className="mt-6 text-sm font-medium">Recurring focus areas</h3>
                {summary.recurring.length ? (
                  summary.recurring.map((item) => (
                    <p key={item.skill} className="mt-3 text-xs leading-6 text-muted-foreground">
                      <span className="capitalize text-foreground">{item.skill}</span> scored below
                      6/10 in {item.count} of the {data.trend.length} most recent evaluated debates.
                      Inspect those reviews before drawing a conclusion.
                    </p>
                  ))
                ) : (
                  <p className="mt-3 text-xs leading-6 text-muted-foreground">
                    No repeated below-6 skill pattern in the available evaluation history. This is
                    not proof of mastery.
                  </p>
                )}
              </Card>
              <Card className="p-6">
                <h2 className="section-title">Achievements</h2>
                <div className="mt-5 space-y-4">
                  {Object.entries(achievementInfo).map(([code, info]) => {
                    const earned = data.achievements.find((a) => a.code === code);
                    return (
                      <div
                        key={code}
                        className={`flex gap-4 rounded-xl border p-4 ${earned ? 'border-primary/40 bg-accent/30' : 'border-border'}`}
                      >
                        <Award
                          className={`mt-1 size-5 shrink-0 ${earned ? 'text-primary' : 'text-muted-foreground'}`}
                        />
                        <div>
                          <p className="text-sm font-medium">{info.title}</p>
                          <p className="mt-1 text-xs leading-6 text-muted-foreground">
                            {info.description}
                          </p>
                          <p className="mt-2 text-xs text-primary">
                            {earned
                              ? `Earned ${new Date(earned.earned_at).toLocaleDateString()}`
                              : 'Not earned yet'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          </>
        )
      )}
    </>
  );
}
