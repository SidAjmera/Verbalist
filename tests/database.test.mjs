import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { database, users, seedUsers, asUser, rpc, motion } from './db-harness.mjs';
let db;
before(async () => {
  db = await database();
  await seedUsers(db);
});
after(async () => {
  await db?.close();
});
test('migration provisions private profiles and safe preferences', async () => {
  const own = await asUser(db, users.alice, (tx) => tx.query('select * from public.profiles'));
  assert.equal(own.rows.length, 1);
  assert.equal(own.rows[0].id, users.alice);
  const prefs = await asUser(db, users.alice, (tx) =>
    tx.query('select * from public.user_preferences'),
  );
  assert.equal(prefs.rows[0].input_mode, 'text');
  assert.equal('api_key' in prefs.rows[0], false);
  const tables = await db.query(
    "select tablename,rowsecurity from pg_tables where schemaname in ('public','private')",
  );
  assert(tables.rows.every((r) => r.rowsecurity));
});
test('unverified and anonymous callers cannot create sessions', async () => {
  await assert.rejects(
    rpc(db, users.unverified, 'create_debate', { p_data: motion }),
    (e) => e.code === '42501',
  );
  await assert.rejects(
    db.transaction(async (tx) => {
      await tx.exec('set local role anon');
      await tx.query('select public.create_debate($1)', [JSON.stringify(motion)]);
    }),
    (e) => e.code === '42501',
  );
});
test('RLS blocks other accounts and immutable transcripts reject direct writes', async () => {
  const session = await rpc(db, users.alice, 'create_debate', { p_data: motion });
  const result = await asUser(db, users.bob, (tx) =>
    tx.query('select * from public.debate_sessions where id=$1', [session.id]),
  );
  assert.equal(result.rows.length, 0);
  await assert.rejects(
    rpc(db, users.bob, 'save_draft', { p_session: session.id, p_expected: 0, p_draft: 'stolen' }),
    (e) => e.code === 'PT404',
  );
  const parts = await asUser(db, users.bob, (tx) =>
    tx.query('select * from public.debate_participants where session_id=$1', [session.id]),
  );
  assert.equal(parts.rows.length, 0);
  await assert.rejects(
    asUser(db, users.alice, (tx) =>
      tx.query('update public.debate_sessions set owner_id=$1 where id=$2', [
        users.bob,
        session.id,
      ]),
    ),
    (e) => e.code === '42501',
  );
  await assert.rejects(
    asUser(db, users.alice, (tx) => tx.query('delete from public.debate_turns')),
    (e) => e.code === '42501',
  );
});
test('draft CAS detects cross-device edits without losing the saved version', async () => {
  const session = await rpc(db, users.alice, 'create_debate', { p_data: motion });
  const first = await rpc(db, users.alice, 'save_draft', {
    p_session: session.id,
    p_expected: 0,
    p_draft: 'Device A draft',
  });
  assert.equal(first.draft_version, 1);
  await assert.rejects(
    rpc(db, users.alice, 'save_draft', {
      p_session: session.id,
      p_expected: 0,
      p_draft: 'Device B stale draft',
    }),
    (e) => e.code === 'PT409',
  );
  const saved = await asUser(db, users.alice, (tx) =>
    tx.query('select draft from public.debate_sessions where id=$1', [session.id]),
  );
  assert.equal(saved.rows[0].draft, 'Device A draft');
});
test('speaking order, idempotency, pause/resume and six-turn completion are enforced', async () => {
  let session = await rpc(db, users.bob, 'create_debate', {
    p_data: { ...motion, side: 'opposition' },
  });
  const append = (speaker, content, request = randomUUID(), version = session.version) =>
    rpc(db, users.bob, 'append_turn', {
      p_session: session.id,
      p_expected: version,
      p_speaker: speaker,
      p_content: content,
      p_request: request,
      p_draft_version: speaker === 'human' ? session.draft_version : null,
    });
  await assert.rejects(append('human', 'Wrong opening'), (e) => e.code === 'PT409');
  await assert.rejects(
    rpc(db, users.bob, 'change_status', {
      p_session: session.id,
      p_expected: 0,
      p_status: 'completed',
    }),
    (e) => e.code === 'PT422',
  );
  const request = randomUUID();
  session = await append('ai', 'Opening case', request);
  const replay = await append('ai', 'Opening case', request, 0);
  assert.equal(replay.turn_count, 1);
  await assert.rejects(append('ai', 'Changed content', request, 0), (e) => e.code === 'PT409');
  session = await rpc(db, users.bob, 'change_status', {
    p_session: session.id,
    p_expected: session.version,
    p_status: 'paused',
  });
  await assert.rejects(append('human', 'Paused case'), (e) => e.code === 'PT409');
  session = await rpc(db, users.bob, 'change_status', {
    p_session: session.id,
    p_expected: session.version,
    p_status: 'active',
  });
  for (const speaker of ['human', 'ai', 'human', 'ai', 'human'])
    session = await append(speaker, `Argument from ${speaker}`);
  assert.equal(session.status, 'completed');
  assert.equal(session.turn_count, 6);
  assert(session.completed_at);
  await assert.rejects(append('ai', 'Extra turn'), (e) => e.code === 'PT409');
  const turns = await asUser(db, users.bob, (tx) =>
    tx.query('select * from public.debate_turns where session_id=$1 order by position', [
      session.id,
    ]),
  );
  assert.equal(turns.rows.length, 6);
});
test('account updates are versioned, isolated, constrained and case-insensitive unique', async () => {
  const args = {
    p_kind: 'profile',
    p_version: 0,
    p_data: { display_name: 'Alice', username: 'Alice_1', avatar_url: null },
  };
  const first = await rpc(db, users.alice, 'update_account', args);
  assert.equal(first.version, 1);
  await assert.rejects(rpc(db, users.alice, 'update_account', args), (e) => e.code === 'PT409');
  await assert.rejects(
    rpc(db, users.bob, 'update_account', {
      ...args,
      p_data: { ...args.p_data, username: 'alice_1' },
    }),
    (e) => e.code === '23505',
  );
  await assert.rejects(
    rpc(db, users.alice, 'update_account', {
      ...args,
      p_version: 1,
      p_data: { ...args.p_data, avatar_url: 'javascript:alert(1)' },
    }),
    (e) => e.code === '23514',
  );
});
test('rate budgets are shared in PostgreSQL and cannot exceed fixed limits', async () => {
  for (let i = 0; i < 3; i++) await rpc(db, users.alice, 'consume_budget', { p_kind: 'export' });
  await assert.rejects(
    rpc(db, users.alice, 'consume_budget', { p_kind: 'export' }),
    (e) => e.code === 'PT429',
  );
  await assert.rejects(
    rpc(db, users.alice, 'consume_budget', { p_kind: 'unlimited' }),
    (e) => e.code === 'PT422',
  );
});
test('dashboard reports account totals and deletion cascades through private records', async () => {
  const stats = await rpc(db, users.bob, 'dashboard_stats');
  assert.equal(stats.completed, 1);
  assert.equal(stats.total_turns, 3);
  assert.equal(stats.streak, 1);
  await db.query('delete from auth.users where id=$1', [users.bob]);
  for (const [table, column] of [
    ['profiles', 'id'],
    ['user_preferences', 'user_id'],
    ['debate_sessions', 'owner_id'],
    ['debate_turns', 'owner_id'],
    ['debate_participants', 'owner_id'],
  ]) {
    const remaining = await db.query(
      `select count(*) as n from public.${table} where ${column}=$1`,
      [users.bob],
    );
    assert.equal(Number(remaining.rows[0].n), 0);
  }
});
