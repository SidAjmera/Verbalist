import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { database, seedUsers, users, rpc, asUser, motion } from './db-harness.mjs';
let db;
before(async () => {
  db = await database();
  await seedUsers(db);
});
after(() => db.close());
const human = '🚆 Public transport can improve access to employment when service remains reliable.';
const opponent =
  'Targeted subsidies may improve access at lower cost, but coverage could be uneven.';
function payload() {
  const ref = { position: 0, start: 0, end: [...human].length, quote: human },
    other = { position: 1, start: 0, end: opponent.length, quote: opponent };
  const scores = (r) =>
    Object.fromEntries(
      ['reasoning', 'evidence', 'structure', 'rebuttal'].map((skill) => [
        skill,
        { score: 6, rationale: 'A developing, qualified argument.', ref: r },
      ]),
    );
  return {
    summary: 'The debate compares universal access and targeted support.',
    uncertainty: 'No independent factual research or delivery assessment.',
    arguments: [
      {
        key: 'human',
        kind: 'claim',
        speaker: 'human',
        text: human,
        explanation: 'An access claim with a reliability assumption.',
        confidence: 0.6,
        ref,
      },
      {
        key: 'ai',
        kind: 'counterargument',
        speaker: 'ai',
        text: opponent,
        explanation: 'Compares a targeted alternative.',
        confidence: 0.6,
        ref: other,
      },
    ],
    links: [
      {
        source: 'ai',
        target: 'human',
        relation: 'rebuts',
        explanation: 'Challenges the need for universal provision.',
        confidence: 0.6,
      },
    ],
    claims: [
      {
        text: 'Transport can improve employment access.',
        uncertainty: 'Requires research about the specific population.',
        ref,
      },
    ],
    ballot: {
      human: scores(ref),
      ai: scores(other),
      delivery: null,
      decision: 'The developed arguments are close on this rubric.',
      clashes: [{ text: 'Universal versus targeted support.', ref }],
      confidence: 0.6,
      uncertainty: 'This brief debate limits the available evidence.',
    },
    coach: {
      summary: 'Explain a causal mechanism.',
      strengths: [{ text: 'The claim includes a useful condition.', ref }],
      weaknesses: [{ text: 'The mechanism needs more explanation.', ref }],
      actions: [
        {
          skill: 'reasoning',
          explanation: 'Explain how access changes job opportunities.',
          rewrite: 'Lower travel costs could broaden the reachable job market.',
          drill_id: 'mechanism',
          ref,
        },
      ],
    },
  };
}
async function debate() {
  let s = await rpc(db, users.alice, 'create_debate', { p_data: motion });
  for (const [speaker, content] of [
    ['human', human],
    ['ai', opponent],
  ])
    s = await rpc(db, users.alice, 'append_turn', {
      p_session: s.id,
      p_expected: s.version,
      p_speaker: speaker,
      p_content: content,
      p_request: randomUUID(),
      p_draft_version: s.draft_version,
    });
  return rpc(db, users.alice, 'change_status', {
    p_session: s.id,
    p_expected: s.version,
    p_status: 'completed',
  });
}
async function save(s, data = payload(), provider = 'openai', request = randomUUID()) {
  return rpc(db, users.alice, 'save_analysis', {
    p_session: s.id,
    p_expected: s.version,
    p_request: request,
    p_provider: provider,
    p_model: 'fixture',
    p_data: data,
  });
}
test('private analysis saves atomically, grounds excerpts, links nodes and rejects stale/reused requests', async () => {
  const s = await debate(),
    request = randomUUID();
  const id = await save(s, payload(), 'openai', request);
  assert.equal(await save(s, payload(), 'openai', request), id);
  assert.equal(
    (await rpc(db, users.alice, 'analysis_detail', { p_session: s.id, p_run: id })).run.id,
    id,
  );
  const other = await debate();
  await assert.rejects(
    rpc(db, users.alice, 'analysis_detail', { p_session: other.id, p_run: id }),
    (e) => e.code === 'PT404',
  );
  const detail = await rpc(db, users.alice, 'analysis_detail', { p_session: s.id });
  assert.equal(detail.arguments.length, 2);
  assert.equal(detail.links[0].source_id, detail.arguments[1].id);
  assert.equal(detail.ballot.human_total, 60);
  assert.equal(detail.ballot.winner, 'draw');
  const format = (
    await asUser(db, users.alice, (tx) =>
      tx.query("select config from public.debate_formats where id='quick'"),
    )
  ).rows[0].config;
  assert.equal(format.scoring.rubric_version, 'quick-v1');
  assert.equal(format.scoring.delivery, false);
  await assert.rejects(
    rpc(db, users.bob, 'analysis_detail', { p_session: s.id }),
    (e) => e.code === 'PT404',
  );
  for (const table of [
    'analysis_runs',
    'arguments',
    'argument_links',
    'judge_ballots',
    'feedback_reports',
    'factual_claims',
  ])
    assert.equal(
      (await asUser(db, users.bob, (tx) => tx.query(`select * from public.${table}`))).rows.length,
      0,
    );
  await assert.rejects(
    rpc(db, users.bob, 'save_analysis', {
      p_session: s.id,
      p_expected: s.version,
      p_request: randomUUID(),
      p_provider: 'openai',
      p_model: 'fixture',
      p_data: payload(),
    }),
    (e) => e.code === 'PT404',
  );
  await assert.rejects(
    rpc(db, users.alice, 'save_analysis', {
      p_session: s.id,
      p_expected: s.version - 1,
      p_request: randomUUID(),
      p_provider: 'openai',
      p_model: 'fixture',
      p_data: payload(),
    }),
    (e) => e.code === 'PT409',
  );
});
test('rejects invented excerpts, dangling links and delivery scoring without leaving partial runs', async () => {
  const s = await debate();
  for (const mutate of [
    (d) => {
      d.arguments[0].ref.quote = 'fabricated text';
    },
    (d) => {
      d.links[0].source = 'missing';
    },
    (d) => {
      d.ballot.delivery = { pace: 10 };
    },
  ]) {
    const data = payload();
    mutate(data);
    await assert.rejects(save(s, data));
  }
  assert.equal(await rpc(db, users.alice, 'analysis_detail', { p_session: s.id }), null);
});
test('progress counts one real evaluation per debate and excludes simulated scores', async () => {
  const s = await debate();
  await save(s);
  await save(s);
  const simulated = await debate();
  await save(simulated, payload(), 'mock');
  const p = await rpc(db, users.alice, 'learning_progress');
  assert.equal(p.evaluated, 2);
  assert.equal(p.skills.reasoning, 6);
  assert.equal(p.trend.length, 2);
  assert.equal(p.simulated_reviews, 1);
  assert.ok(p.achievements.some((a) => a.code === 'first_review'));
  assert.equal((await rpc(db, users.bob, 'learning_progress')).evaluated, 0);
});
test('research needs sources for a classification and uses ownership/version checks', async () => {
  const s = await debate();
  await save(s);
  const c = (await rpc(db, users.alice, 'analysis_detail', { p_session: s.id })).claims[0];
  const args = {
    p_claim: c.id,
    p_expected: 0,
    p_status: 'verified',
    p_assessment: 'A source supports this scoped claim.',
    p_model: 'fixture',
    p_sources: [],
  };
  await assert.rejects(rpc(db, users.alice, 'save_research', args), (e) => e.code === 'PT422');
  await assert.rejects(rpc(db, users.bob, 'save_research', args), (e) => e.code === 'PT404');
  args.p_sources = [{ url: 'https://example.org/evidence', title: 'Fixture source' }];
  await rpc(db, users.alice, 'save_research', args);
  const detail = await rpc(db, users.alice, 'analysis_detail', { p_session: s.id });
  assert.equal(detail.claims[0].status, 'verified');
  assert.equal(detail.sources.length, 1);
  await assert.rejects(rpc(db, users.alice, 'save_research', args), (e) => e.code === 'PT409');
});
test('drill submissions are grounded/idempotent and private learning records cascade on deletion', async () => {
  const feedback = {
    summary: 'A developing response.',
    criteria: [1, 2, 3].map(() => ({
      score: 1,
      explanation: 'The claim is clear but the steps need detail.',
      quote: 'Public transport',
    })),
    improvement: 'Explain the causal steps.',
  };
  const request = randomUUID();
  const args = {
    p_drill: 'mechanism',
    p_request: request,
    p_response: human,
    p_provider: 'openai',
    p_model: 'fixture',
    p_feedback: feedback,
  };
  const a = await rpc(db, users.alice, 'save_drill_attempt', args);
  assert.equal(a.score, 3);
  assert.equal((await rpc(db, users.alice, 'save_drill_attempt', args)).id, a.id);
  await assert.rejects(
    rpc(db, users.alice, 'save_drill_attempt', { ...args, p_response: opponent }),
    (e) => e.code === 'PT409',
  );
  const p = await rpc(db, users.alice, 'learning_progress');
  assert.equal(p.drill_count, 1);
  assert.ok(p.achievements.some((x) => x.code === 'first_drill'));
  await assert.rejects(
    asUser(db, users.alice, (tx) =>
      tx.query("insert into public.achievements(owner_id,code) values($1,'first_drill')", [
        users.bob,
      ]),
    ),
    (e) => e.code === '42501',
  );
  await db.query('delete from auth.users where id=$1', [users.alice]);
  for (const table of [
    'analysis_runs',
    'arguments',
    'argument_links',
    'judge_ballots',
    'feedback_reports',
    'factual_claims',
    'evidence_sources',
    'drill_attempts',
    'user_progress',
    'achievements',
  ])
    assert.equal(
      (await db.query(`select * from public.${table} where owner_id=$1`, [users.alice])).rows
        .length,
      0,
    );
});
