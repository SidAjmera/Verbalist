import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { database, seedUsers, users, rpc, asUser } from './db-harness.mjs';
let db;
before(async () => {
  db = await database();
  await seedUsers(db);
});
after(() => db?.close());
beforeEach(() => db.exec('delete from private.rate_budgets'));
const setup = {
  committee_key: 'environment',
  agenda: 'Financing locally led adaptation through international cooperation',
  delegates: [
    {
      country_code: 'SG',
      brief: 'Hypothetical practice: prioritize transparent funding and measurable local outcomes.',
      sources: ['https://ask.un.org/faq/418224'],
    },
    {
      country_code: 'IN',
      brief:
        'Hypothetical practice: prioritize affordable implementation and sharing practical technology.',
      sources: [],
    },
    {
      country_code: 'KE',
      brief:
        'Hypothetical practice: prioritize local decision making and predictable access to funding.',
      sources: [],
    },
  ],
};
const create = (user = users.alice, data = setup) => rpc(db, user, 'create_mun', { p_data: data });
const view = (id, user = users.alice) => rpc(db, user, 'mun_detail', { p_committee: id });
async function append(
  id,
  text = 'A concrete practice proposal with clear implementation responsibilities.',
  provider = null,
  request = randomUUID(),
) {
  const d = await view(id);
  return rpc(db, users.alice, 'mun_append', {
    p_committee: id,
    p_expected: d.committee.version,
    p_draft: provider === null ? d.draft.version : null,
    p_request: request,
    p_text: text,
    p_provider: provider,
    p_model: provider ? 'fixture' : null,
  });
}
async function command(id, action, topic = null, target = null) {
  const d = await view(id);
  return rpc(db, users.alice, 'mun_command', {
    p_committee: id,
    p_expected: d.committee.version,
    p_action: action,
    p_topic: topic,
    p_target: target,
  });
}
test('MUN records require verified ownership and never allow direct transcript or brief writes', async () => {
  const id = await create();
  const d = await view(id);
  assert.equal(d.delegates.length, 3);
  assert.equal(d.delegates[0].role, 'human');
  assert.equal(d.delegates[1].role, 'ai');
  assert.equal(d.committee.procedure_version, 'mun-practice-v1');
  await assert.rejects(create(users.unverified), (e) => e.code === '42501');
  await assert.rejects(view(id, users.bob), (e) => e.code === 'PT404');
  for (const table of ['mun_committees', 'mun_delegates', 'mun_messages', 'mun_drafts'])
    assert.equal(
      (await asUser(db, users.bob, (tx) => tx.query(`select * from public.${table}`))).rows.length,
      0,
    );
  await assert.rejects(
    asUser(db, users.alice, (tx) =>
      tx.query("update public.mun_delegates set brief='Forged policy' where committee_id=$1", [id]),
    ),
    (e) => e.code === '42501',
  );
});
test('invalid delegate rosters and research links roll back without partial committees', async () => {
  const before = (await db.query('select count(*)::integer n from public.mun_committees')).rows[0]
    .n;
  const duplicate = structuredClone(setup);
  duplicate.delegates[1].country_code = 'SG';
  await assert.rejects(create(users.alice, duplicate), (e) => e.code === '23505');
  const bad = structuredClone(setup);
  bad.delegates[1].sources = ['javascript:alert(1)'];
  await assert.rejects(create(users.alice, bad), (e) => e.code === 'PT422');
  assert.equal(
    (await db.query('select count(*)::integer n from public.mun_committees')).rows[0].n,
    before,
  );
});
test('private drafts use independent versions and ordered openings reject the wrong actor and stale replay', async () => {
  const id = await create();
  const saved = await rpc(db, users.alice, 'mun_save_draft', {
    p_committee: id,
    p_expected: 0,
    p_text: 'My private opening draft.',
  });
  assert.equal(saved.version, 1);
  assert.equal((await view(id)).committee.version, 0);
  await assert.rejects(
    rpc(db, users.alice, 'mun_save_draft', {
      p_committee: id,
      p_expected: 0,
      p_text: 'Stale edit',
    }),
    (e) => e.code === 'PT409',
  );
  await assert.rejects(append(id, 'Premature AI response', 'mock'), (e) => e.code === 'PT422');
  const request = randomUUID();
  let d = await append(
    id,
    'Opening: transparent funding can support concrete locally led outcomes.',
    null,
    request,
  );
  assert.equal(d.draft.draft, '');
  assert.equal(d.committee.current_ordinal, 1);
  const replay = await rpc(db, users.alice, 'mun_append', {
    p_committee: id,
    p_expected: 0,
    p_draft: 1,
    p_request: request,
    p_text: d.messages[0].content,
    p_provider: null,
    p_model: null,
  });
  assert.equal(replay.messages.length, 1);
  await assert.rejects(
    rpc(db, users.alice, 'mun_append', {
      p_committee: id,
      p_expected: 0,
      p_draft: 1,
      p_request: request,
      p_text: 'Changed replay',
      p_provider: null,
      p_model: null,
    }),
    (e) => e.code === 'PT409',
  );
  await assert.rejects(append(id), (e) => e.code === 'PT422');
  d = await append(
    id,
    'SIMULATION: consider affordable delivery and practical technology.',
    'mock',
  );
  assert.ok(d.messages[1].simulated);
  d = await append(
    id,
    'SIMULATION: protect local decision making and predictable funding.',
    'mock',
  );
  assert.equal(d.committee.stage, 'caucus');
  assert.equal(d.committee.current_ordinal, 0);
});
test('topic/partner changes occur at human slots; pause and finish preserve immutable saved contributions', async () => {
  const id = await create();
  await assert.rejects(
    command(id, 'negotiate', 'A funding compromise to discuss', 2),
    (e) => e.code === 'PT422',
  );
  await append(id);
  await append(id, 'SIMULATION opening one', 'mock');
  await append(id, 'SIMULATION opening two', 'mock');
  await command(id, 'negotiate', 'Design a transparent grant allocation process', 2);
  let d = await append(id, 'Could we combine predictable grants with local monitoring?');
  assert.equal(d.committee.current_ordinal, 2);
  await assert.rejects(
    command(id, 'caucus', 'A new topic before the reply arrives'),
    (e) => e.code === 'PT422',
  );
  await command(id, 'pause');
  await assert.rejects(append(id, 'SIMULATION: pending answer', 'mock'), (e) => e.code === 'PT422');
  await command(id, 'resume');
  d = await append(
    id,
    'SIMULATION: local monitoring is consistent with the supplied brief.',
    'mock',
  );
  assert.equal(d.messages.at(-1).delegate_id, d.delegates[2].id);
  assert.equal(d.committee.current_ordinal, 0);
  await command(id, 'caucus', 'Compare implementation costs and transparent reporting');
  d = await append(id);
  assert.equal(d.messages.at(-1).topic, 'Compare implementation costs and transparent reporting');
  assert.equal(d.messages[3].topic, 'Design a transparent grant allocation process');
  const done = await command(id, 'finish');
  assert.equal(done.committee.status, 'completed');
  assert.equal(done.messages.length, 6);
  await assert.rejects(append(id, 'Late speech', 'mock'), (e) => e.code === 'PT422');
  await assert.rejects(command(id, 'resume'), (e) => e.code === 'PT422');
});
test('exportable MUN rows belong to the owner and account deletion cascades every private record', async () => {
  const id = await create();
  await append(id);
  await command(id, 'cancel');
  assert.equal((await view(id)).committee.status, 'cancelled');
  const other = await create(users.bob);
  await db.query('delete from auth.users where id=$1', [users.alice]);
  for (const table of ['mun_committees', 'mun_delegates', 'mun_messages', 'mun_drafts'])
    assert.equal(
      (await db.query(`select * from public.${table} where owner_id=$1`, [users.alice])).rows
        .length,
      0,
    );
  assert.equal((await view(other, users.bob)).committee.id, other);
});
