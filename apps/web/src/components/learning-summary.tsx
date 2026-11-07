'use client';
import Link from 'next/link';
import type { LearningProgress } from '@verbalist/shared-types';
import { useApi } from '@/hooks/use-api';
import { learningSummary, skillDrills } from '@/lib/learning';
import { Card } from './ui/card';
export function LearningSummary() {
  const { data, error } = useApi<LearningProgress>('/v1/learning/progress');
  if (!data)
    return error ? (
      <p className="notice mb-7">
        Learning insights are temporarily unavailable. Your saved debates are unaffected.
      </p>
    ) : null;
  const { average, focuses } = learningSummary(data);
  return (
    <Card className="mb-7 grid gap-5 p-6 sm:grid-cols-3">
      <div>
        <p className="eyebrow">ADVISORY AVERAGE</p>
        <p className="mt-3 text-2xl font-semibold text-primary">
          {average === null ? '—' : `${average.toFixed(1)} / 100`}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {data.evaluated} evaluated debates · simulations excluded
        </p>
      </div>
      <div>
        <p className="eyebrow">DELIBERATE PRACTICE</p>
        <p className="mt-3 text-2xl font-semibold">{data.drill_count}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Saved drills with nonsimulated feedback
        </p>
      </div>
      <div>
        <p className="eyebrow">YOUR NEXT STEP</p>
        <p className="mt-3 text-sm">
          {focuses.length
            ? `Build your ${focuses[0]} skills.`
            : 'Finish a debate, then generate its evaluation.'}
        </p>
        <Link
          className="mt-3 inline-block text-xs text-primary"
          href={focuses.length ? `/practice?drill=${skillDrills[focuses[0]]}` : '/progress'}
        >
          {focuses.length ? 'Open recommended drill' : 'See your learning journey'} →
        </Link>
      </div>
    </Card>
  );
}
