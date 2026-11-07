'use client';
import { useState } from 'react';
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { SKILLS, type Skill, type LearningProgress } from '@verbalist/shared-types';
export default function LearningChart({ trend }: { trend: LearningProgress['trend'] }) {
  const [metric, setMetric] = useState<Skill | 'total'>('total');
  const data = trend.map((item, index) => ({
    label: `${index + 1}`,
    date: new Date(item.completed_at).toLocaleDateString(),
    score: metric === 'total' ? item.human_total : item.skills[metric].score,
  }));
  return (
    <>
      <label className="label mt-5 max-w-xs">
        Chart metric
        <select
          className="field"
          value={metric}
          onChange={(event) => setMetric(event.target.value as Skill | 'total')}
        >
          <option value="total">Overall advisory score / 100</option>
          {SKILLS.map((skill) => (
            <option value={skill} key={skill}>
              {skill[0].toUpperCase() + skill.slice(1)} / 10
            </option>
          ))}
        </select>
      </label>
      <div
        className="mt-5 h-64 min-w-0"
        role="img"
        aria-label={`Evaluation score trend: ${metric}; exact values and dates are in the table below`}
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={{ width: 600, height: 256 }}
        >
          <LineChart
            data={data}
            margin={{ top: 10, right: 15, bottom: 10, left: 0 }}
            accessibilityLayer
          >
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="var(--muted-foreground)"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[0, metric === 'total' ? 100 : 10]}
              width={36}
              stroke="var(--muted-foreground)"
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 10,
              }}
              labelFormatter={(_, payload) => payload[0]?.payload.date || 'Debate'}
            />
            <Line
              dataKey="score"
              name={
                metric === 'total' ? 'Advisory score' : metric[0].toUpperCase() + metric.slice(1)
              }
              stroke="#438bff"
              strokeWidth={3}
              isAnimationActive={false}
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
