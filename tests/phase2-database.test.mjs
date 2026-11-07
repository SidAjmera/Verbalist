import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { database, users, seedUsers, rpc, motion, asUser } from './db-harness.mjs';
let db;
before(async () => {
  db = await database();
  await seedUsers(db);
});
after(async () => await db?.close());
test('voice preferences synchronize without recording consent or provider secrets', async () => {
  const prefs = (
    await asUser(db, users.alice, (tx) => tx.query('select * from public.user_preferences'))
  ).rows[0];
  assert.equal(prefs.theme, 'dark');
  const updated = await rpc(db, users.alice, 'update_account', {
    p_kind: 'preferences',
    p_version: prefs.version,
    p_data: {
      theme: 'dark',
      provider: 'local',
      model: 'installed-model',
      difficulty: 'advanced',
      input_mode: 'voice',
      output_mode: 'both',
      speech_language: 'en-SG',
      speech_rate: 1.25,
      speech_voice: 'device-voice',
    },
  });
  assert.equal(updated.input_mode, 'voice');
  assert.equal(Number(updated.speech_rate), 1.25);
  assert.equal('recording_consent' in updated, false);
  assert.equal('api_key' in updated, false);
  await assert.rejects(
    rpc(db, users.alice, 'update_account', {
      p_kind: 'preferences',
      p_version: updated.version,
      p_data: { ...updated, speech_rate: 4 },
    }),
    (e) => e.code === '23514',
  );
  const bob = await asUser(db, users.bob, (tx) =>
    tx.query('select * from public.user_preferences where user_id=$1', [users.alice]),
  );
  assert.equal(bob.rows.length, 0);
});
test('timed sessions enforce start, freeze on pause, resume and reject stale/foreign clocks', async () => {
  let session = await rpc(db, users.alice, 'create_debate', { p_data: { ...motion, timed: true } });
  assert.equal(session.clock_phase, 'preparation');
  assert(session.clock_started_at);
  await assert.rejects(
    rpc(db, users.alice, 'append_turn', {
      p_session: session.id,
      p_expected: 0,
      p_speaker: 'human',
      p_content: 'Too early',
      p_request: randomUUID(),
      p_draft_version: 0,
    }),
    (e) => e.code === 'PT422',
  );
  await assert.rejects(
    rpc(db, users.bob, 'start_speaking', { p_session: session.id, p_expected: 0 }),
    (e) => e.code === 'PT404',
  );
  session = await rpc(db, users.alice, 'start_speaking', { p_session: session.id, p_expected: 0 });
  assert.equal(session.clock_phase, 'speaking');
  await assert.rejects(
    rpc(db, users.alice, 'start_speaking', { p_session: session.id, p_expected: 0 }),
    (e) => e.code === 'PT409',
  );
  await db.query(
    "update public.debate_sessions set clock_started_at=clock_timestamp()-interval '10 seconds' where id=$1",
    [session.id],
  );
  session = await rpc(db, users.alice, 'change_status', {
    p_session: session.id,
    p_expected: session.version,
    p_status: 'paused',
  });
  assert(session.clock_remaining_ms <= 110000 && session.clock_remaining_ms > 109000);
  assert.equal(session.clock_started_at, null);
  const remaining = session.clock_remaining_ms;
  session = await rpc(db, users.alice, 'change_status', {
    p_session: session.id,
    p_expected: session.version,
    p_status: 'active',
  });
  assert.equal(session.clock_remaining_ms, remaining);
  assert(session.clock_started_at);
  session = await rpc(db, users.alice, 'append_turn', {
    p_session: session.id,
    p_expected: session.version,
    p_speaker: 'human',
    p_content: 'Opening argument',
    p_request: randomUUID(),
    p_draft_version: session.draft_version,
  });
  assert.equal(session.clock_phase, 'idle');
  session = await rpc(db, users.alice, 'append_turn', {
    p_session: session.id,
    p_expected: session.version,
    p_speaker: 'ai',
    p_content: 'Counterargument',
    p_request: randomUUID(),
    p_draft_version: null,
  });
  assert.equal(session.clock_phase, 'preparation');
  session = await rpc(db, users.alice, 'change_status', {
    p_session: session.id,
    p_expected: session.version,
    p_status: 'completed',
  });
  assert.equal(session.clock_phase, 'idle');
  assert.equal(session.clock_started_at, null);
});
test('elapsed preparation pauses into ready state and untimed sessions stay compatible', async () => {
  let timed = await rpc(db, users.bob, 'create_debate', { p_data: { ...motion, timed: true } });
  await db.query(
    "update public.debate_sessions set clock_started_at=clock_timestamp()-interval '120 seconds' where id=$1",
    [timed.id],
  );
  timed = await rpc(db, users.bob, 'change_status', {
    p_session: timed.id,
    p_expected: timed.version,
    p_status: 'paused',
  });
  assert.equal(timed.clock_phase, 'ready');
  assert.equal(timed.clock_remaining_ms, 120000);
  const plain = await rpc(db, users.bob, 'create_debate', { p_data: motion });
  assert.equal(plain.timed, false);
  assert.equal(plain.clock_phase, 'idle');
  await assert.rejects(
    rpc(db, users.bob, 'start_speaking', { p_session: plain.id, p_expected: 0 }),
    (e) => e.code === 'PT422',
  );
});
