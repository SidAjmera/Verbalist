import { SKILLS, type LearningProgress, type Skill } from '@verbalist/shared-types';
export const skillDrills: Record<Skill, string> = {
  reasoning: 'mechanism',
  evidence: 'evidence',
  structure: 'weighing',
  rebuttal: 'rebuttal',
};
export const achievementInfo = {
  first_debate: { title: 'First case completed', description: 'Complete a practice debate.' },
  three_debates: { title: 'Finding your rhythm', description: 'Complete three practice debates.' },
  first_review: {
    title: 'Reflect and refine',
    description: 'Save a nonsimulated final evaluation.',
  },
  first_drill: {
    title: 'Deliberate practice',
    description: 'Complete a drill with nonsimulated feedback.',
  },
};
export function learningSummary(data: LearningProgress) {
  const weights = { reasoning: 3, evidence: 2, structure: 2, rebuttal: 3 };
  const average = SKILLS.every((skill) => typeof data.skills[skill] === 'number')
    ? SKILLS.reduce((sum, skill) => sum + data.skills[skill]! * weights[skill], 0)
    : null;
  const focuses = SKILLS.filter((skill) => typeof data.skills[skill] === 'number').toSorted(
    (a, b) => data.skills[a]! - data.skills[b]!,
  );
  const recurring = SKILLS.flatMap((skill) => {
    const count = data.trend.filter((item) => item.skills[skill].score < 6).length;
    return count >= 2 ? [{ skill, count }] : [];
  });
  return { average, focuses, recurring };
}
