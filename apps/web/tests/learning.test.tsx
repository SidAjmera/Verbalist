import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnalysisPanel } from '@/components/analysis-panel';
import { learningSummary } from '@/lib/learning';
import type { AnalysisDetail, DebateSession, LearningProgress } from '@verbalist/shared-types';
const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  replace: vi.fn(),
  reload: vi.fn(),
  data: null as unknown,
  provider: 'mock',
}));
vi.mock('@/hooks/use-api', () => ({
  useApi: () => ({
    data: mocks.data,
    error: '',
    loading: false,
    reload: mocks.reload,
    replace: mocks.replace,
  }),
}));
vi.mock('@/components/workspace-provider', () => ({
  useWorkspace: () => ({
    provider: { provider: mocks.provider, model: 'fixture' },
    apiKey: 'ephemeral',
  }),
}));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  api: mocks.api,
}));
vi.mock('next/dynamic', () => ({
  default: () => () => <div>Interactive argument map fixture</div>,
}));
const ref = { position: 0, quote: 'A saved claim', start: 0, end: 13 };
const session = { id: 'session', version: 3, status: 'completed', turn_count: 2 } as DebateSession;
const detail: AnalysisDetail = {
  run: {
    id: 'run',
    session_id: 'session',
    session_version: 3,
    provider: 'mock',
    model: 'fixture',
    simulated: true,
    rubric_version: 'quick-v1',
    summary: 'A simulated summary.',
    uncertainty: 'No factual verification.',
    created_at: '2026-11-07T00:00:00Z',
  },
  arguments: [
    {
      id: 'argument',
      ordinal: 0,
      data: {
        key: 'a1',
        kind: 'potential_fallacy',
        speaker: 'human',
        text: 'A saved claim',
        explanation: 'Potentially overgeneralizes a narrow example.',
        confidence: 0.5,
        ref,
      },
    },
  ],
  links: [],
  claims: [
    {
      id: 'claim',
      data: { text: 'A test factual claim.', uncertainty: 'Has not been researched.', ref },
      status: 'unverified',
      assessment: 'No research yet.',
      version: 0,
      checked_at: null,
      research_model: null,
    },
  ],
  sources: [],
  ballot: null,
  coach: {
    summary: 'Explain a causal mechanism.',
    strengths: [{ text: 'A clear stated position.', ref }],
    weaknesses: [{ text: 'The inference needs support.', ref }],
    actions: [
      {
        skill: 'reasoning',
        explanation: 'Explain the missing causal link.',
        rewrite: 'If access improves, a larger job market may become reachable.',
        drill_id: 'mechanism',
        ref,
      },
    ],
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.data = structuredClone(detail);
  mocks.provider = 'mock';
  mocks.api.mockResolvedValue(detail);
});
it('labels simulations/potential findings, exposes exact excerpts and blocks unsupported research', async () => {
  const user = userEvent.setup();
  render(<AnalysisPanel session={session} />);
  expect(screen.getByText(/scores excluded from progress/)).toBeVisible();
  await user.click(screen.getByText('Argument list & relationships'));
  expect(screen.getByText(/Potential finding, not a proven fallacy/)).toBeVisible();
  await user.click(screen.getAllByText('Transcript excerpt · Turn 1')[0]);
  expect(screen.getAllByText('A saved claim')[1]).toBeVisible();
  expect(screen.getByRole('button', { name: 'Research claim' })).toBeDisabled();
  expect(screen.getByRole('link', { name: 'Practice this skill' })).toHaveAttribute(
    'href',
    '/practice?drill=mechanism',
  );
});
it('requires explicit research consent before sending a request-scoped key', async () => {
  const user = userEvent.setup();
  mocks.provider = 'openai';
  render(<AnalysisPanel session={session} />);
  expect(screen.getByRole('button', { name: 'Research claim' })).toBeDisabled();
  await user.click(screen.getByRole('checkbox', { name: /Allow sending/ }));
  await user.click(screen.getByRole('button', { name: 'Research claim' }));
  expect(mocks.api).toHaveBeenCalledWith(
    '/v1/claims/claim/research',
    expect.objectContaining({
      body: JSON.stringify({
        provider: 'openai',
        model: 'fixture',
        expected_version: 0,
        consent: true,
      }),
    }),
    'ephemeral',
  );
  expect(mocks.replace).toHaveBeenCalledWith(detail);
});
it('computes weighted actual averages, preserves zero scores and derives repeated focus from saved trends', () => {
  const data = {
    evaluated: 2,
    drill_count: 0,
    simulated_reviews: 0,
    achievements: [],
    skills: { reasoning: 0, evidence: 5, structure: 7, rebuttal: 8 },
    trend: [1, 2].map((index) => ({
      id: `run-${index}`,
      session_id: `session-${index}`,
      completed_at: '2026-11-07T00:00:00Z',
      human_total: 48,
      model: 'fixture',
      provider: 'openai',
      rubric_version: 'quick-v1',
      skills: {
        reasoning: { score: 0, rationale: 'Fixture rationale.', ref },
        evidence: { score: 5, rationale: 'Fixture rationale.', ref },
        structure: { score: 7, rationale: 'Fixture rationale.', ref },
        rebuttal: { score: 8, rationale: 'Fixture rationale.', ref },
      },
    })),
  } as LearningProgress;
  const summary = learningSummary(data);
  expect(summary.average).toBe(48);
  expect(summary.focuses[0]).toBe('reasoning');
  expect(summary.recurring).toEqual([
    { skill: 'reasoning', count: 2 },
    { skill: 'evidence', count: 2 },
  ]);
  expect(learningSummary({ ...data, skills: {}, trend: [] }).average).toBeNull();
});
