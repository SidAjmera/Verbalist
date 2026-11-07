import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { database, seedUsers, users, rpc, asUser, motion } from './db-harness.mjs';
const judge = '00000000-0000-4000-8000-000000000004',
  eve = '00000000-0000-4000-8000-000000000005',
  fourth = '00000000-0000-4000-8000-000000000006';
let db;
before(async () => {
  db = await database();
  await seedUsers(db);
  for (const id of [judge, eve, fourth])
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [
      id,
      `${id}@example.test`,
    ]);
});
after(() => db?.close());
beforeEach(() => db.exec('delete from private.rate_budgets'));
const data = {
  motion: motion.motion,
  alias: 'Moderator',
  role: 'judge',
  preparation_seconds: 0,
  speaking_seconds: 60,
};
const hash = () => createHash('sha256').update(randomUUID()).digest('hex');
async function view(id, user = judge) {
  return rpc(db, user, 'room_detail', { p_room: id });
}
async function command(id, action, extra = {}, user = judge) {
  const d = await view(id, user);
  return rpc(db, user, 'room_command', {
    p_room: id,
    p_expected: d.room.version,
    p_action: action,
    p_data: extra,
  });
}
async function invitation(id, role, user = judge) {
  const secret = hash();
  const meta = await rpc(db, user, 'create_invitation', {
    p_room: id,
    p_tournament: null,
    p_role: role,
    p_hash: secret,
    p_minutes: 60,
  });
  return { secret, ...meta };
}
async function join(id, user, role, alias) {
  const code = await invitation(id, role);
  await rpc(db, user, 'accept_invitation', { p_hash: code.secret, p_alias: alias });
  return code;
}
async function room() {
  const id = await rpc(db, judge, 'create_room', { p_data: data });
  await join(id, users.alice, 'proposition', 'Alice');
  await join(id, users.bob, 'opposition', 'Bob');
  return id;
}
async function start(id, rank = false) {
  await command(id, 'ready', { ready: true, ranking_consent: rank }, users.alice);
  await command(id, 'ready', { ready: true, ranking_consent: rank }, users.bob);
  return command(id, 'start');
}
async function result(id, winner = 'opposition', request = randomUUID()) {
  const d = await view(id);
  return rpc(db, judge, 'confirm_room_result', {
    p_room: id,
    p_expected: d.room.version,
    p_request: request,
    p_winner: winner,
    p_reason: 'I independently reviewed the saved record and concession.',
    p_basis: 'manual',
    p_ballot: null,
  });
}
test('invitations are private, bounded and revocable; drafts stay private and roles cannot be stolen', async () => {
  const id = await room();
  await assert.rejects(view(id, eve), (e) => e.code === 'PT404');
  assert.equal(
    (await asUser(db, eve, (tx) => tx.query('select * from public.debate_rooms'))).rows.length,
    0,
  );
  await assert.rejects(
    asUser(db, users.alice, (tx) => tx.query('select * from public.invitations')),
    (e) => e.code === '42501',
  );
  const d = await view(id);
  assert.ok(!JSON.stringify(d).includes('token_hash'));
  const occupied = await invitation(id, 'opposition');
  await assert.rejects(
    rpc(db, eve, 'accept_invitation', { p_hash: occupied.secret, p_alias: 'Intruder' }),
    (e) => e.code === 'PT409',
  );
  const revoked = await invitation(id, 'spectator');
  await command(id, 'revoke_invite', { invite_id: revoked.id });
  await assert.rejects(
    rpc(db, eve, 'accept_invitation', { p_hash: revoked.secret, p_alias: 'Observer' }),
    (e) => e.code === 'PT404',
  );
  await rpc(db, users.alice, 'room_save_draft', {
    p_room: id,
    p_expected: 0,
    p_text: 'My private unsubmitted preparation.',
  });
  assert.equal((await view(id, users.bob)).draft.draft, '');
  assert.equal(
    (
      await asUser(db, users.bob, (tx) =>
        tx.query('select * from public.room_drafts where room_id=$1', [id]),
      )
    ).rows.length,
    0,
  );
  await assert.rejects(
    rpc(db, users.unverified, 'create_room', { p_data: data }),
    (e) => e.code === '42501',
  );
});
test('ready/start/clock/turn versions and replay identifiers serialize two human speakers', async () => {
  const id = await room();
  await assert.rejects(command(id, 'start'), (e) => e.code === 'PT422');
  await start(id);
  await assert.rejects(command(id, 'speak', {}, users.bob), (e) => e.code === 'PT422');
  let d = await view(id, users.alice);
  await assert.rejects(
    rpc(db, users.alice, 'room_submit_turn', {
      p_room: id,
      p_expected: d.room.version,
      p_draft: 0,
      p_request: randomUUID(),
      p_text: 'Too early.',
    }),
    (e) => e.code === 'PT422',
  );
  await command(id, 'speak', {}, users.alice);
  d = await view(id, users.alice);
  const request = randomUUID(),
    args = {
      p_room: id,
      p_expected: d.room.version,
      p_draft: 0,
      p_request: request,
      p_text: '🚆 Affordable travel broadens access when service remains reliable.',
    };
  await rpc(db, users.alice, 'room_submit_turn', args);
  await rpc(db, users.alice, 'room_submit_turn', args);
  assert.equal((await view(id)).turns.length, 1);
  await command(id, 'speak', {}, users.bob);
  await db.query(
    "update public.debate_rooms set clock_started_at=clock_timestamp()-interval '2 seconds' where id=$1",
    [id],
  );
  d = await command(id, 'pause', { reason: 'Technical pause' });
  assert.ok(d.room.clock_remaining_ms < 60000);
  const frozen = d.room.clock_remaining_ms;
  d = await command(id, 'resume', { reason: 'Ready to resume' });
  assert.equal(d.room.clock_remaining_ms, frozen);
  for (let pos = 1; pos < 6; pos++) {
    const who = pos % 2 ? users.bob : users.alice;
    d = await view(id, who);
    if (d.room.clock_phase !== 'speaking') d = await command(id, 'speak', {}, who);
    await rpc(db, who, 'room_submit_turn', {
      p_room: id,
      p_expected: d.room.version,
      p_draft: d.draft.version,
      p_request: randomUUID(),
      p_text: `Argument ${pos + 1}: compare mechanisms and the strongest alternative.`,
    });
  }
  assert.equal((await view(id)).room.status, 'completed');
});
test('presence and signals are fenced to active consenting members and current connection IDs', async () => {
  const id = await room(),
    a = randomUUID(),
    b = randomUUID();
  await rpc(db, users.alice, 'room_connect', { p_room: id, p_connection: a });
  await rpc(db, users.bob, 'room_connect', { p_room: id, p_connection: b });
  for (const [user, conn] of [
    [users.alice, a],
    [users.bob, b],
  ])
    await rpc(db, user, 'room_voice', { p_room: id, p_connection: conn, p_enabled: true });
  const signal = {
    p_room: id,
    p_connection: a,
    p_target: users.bob,
    p_target_connection: b,
    p_kind: 'candidate',
    p_payload: { candidate: 'fixture-candidate' },
  };
  await rpc(db, users.alice, 'room_send_signal', signal);
  const tick = await rpc(db, users.bob, 'room_live_tick', {
    p_room: id,
    p_connection: b,
    p_after: 0,
  });
  assert.equal(tick.signals.length, 1);
  await assert.rejects(
    rpc(db, eve, 'room_connect', { p_room: id, p_connection: randomUUID() }),
    (e) => e.code === 'PT404',
  );
  const replacement = randomUUID();
  await rpc(db, users.bob, 'room_connect', { p_room: id, p_connection: replacement });
  await assert.rejects(rpc(db, users.alice, 'room_send_signal', signal), (e) => e.code === '42501');
  await assert.rejects(
    rpc(db, users.bob, 'room_live_tick', { p_room: id, p_connection: b, p_after: 0 }),
    (e) => e.code === 'PT409',
  );
  await command(id, 'mute', { user_id: users.alice, muted: true });
  const state = await rpc(db, users.bob, 'room_live_tick', {
    p_room: id,
    p_connection: replacement,
    p_after: 0,
  });
  assert.ok(state.peers.find((p) => p.user_id === users.alice).muted);
  await command(id, 'remove', { user_id: users.bob });
  await assert.rejects(view(id, users.bob), (e) => e.code === 'PT404');
  await assert.rejects(
    rpc(db, users.bob, 'room_live_tick', { p_room: id, p_connection: replacement, p_after: 0 }),
    (e) => e.code === 'PT404',
  );
});
test('independent human review and bilateral consent gate ranking credits, with no duplicate awards', async () => {
  for (const [user, handle] of [
    [users.alice, 'AlicePractice'],
    [users.bob, 'BobPractice'],
  ])
    await rpc(db, user, 'set_ranking_profile', { p_expected: 0, p_handle: handle, p_opted: true });
  const id = await room();
  await start(id, true);
  await command(
    id,
    'concede',
    { reason: 'I concede this match after considering the opposing case.' },
    users.alice,
  );
  const d = await view(id);
  const args = {
    p_room: id,
    p_expected: d.room.version,
    p_request: randomUUID(),
    p_winner: 'opposition',
    p_reason: 'I independently reviewed this match and its concession.',
    p_basis: 'manual',
    p_ballot: null,
  };
  await assert.rejects(
    rpc(db, users.alice, 'confirm_room_result', args),
    (e) => e.code === '42501',
  );
  const res = await rpc(db, judge, 'confirm_room_result', args);
  assert.equal(res.ranked, true);
  assert.equal((await rpc(db, judge, 'confirm_room_result', args)).id, res.id);
  await command(id, 'remove', { user_id: users.bob });
  assert.equal((await view(id)).room.status, 'completed');
  assert.equal((await view(id)).result.id, res.id);
  await assert.rejects(view(id, users.bob), (e) => e.code === 'PT404');
  const board = await rpc(db, eve, 'practice_leaderboard');
  assert.equal(board.find((x) => x.handle === 'BobPractice').points, 3);
  assert.ok(!JSON.stringify(board).includes('room_id'));
  assert.ok(!JSON.stringify(board).includes(users.alice));
  await rpc(db, users.bob, 'set_ranking_profile', {
    p_expected: 1,
    p_handle: 'BobPractice',
    p_opted: false,
  });
  assert.ok(!(await rpc(db, eve, 'practice_leaderboard')).some((x) => x.handle === 'BobPractice'));
  const unranked = await room();
  await start(unranked);
  await command(
    unranked,
    'concede',
    { reason: 'I concede this separate unranked practice match.' },
    users.alice,
  );
  assert.equal((await result(unranked)).ranked, false);
});
test('private four-person brackets seed, schedule, advance reviewed winners and finish consistently', async () => {
  const t = await rpc(db, judge, 'create_tournament', {
      p_data: { ...data, title: 'Private practice bracket', capacity: 4 },
    }),
    secret = hash();
  await rpc(db, judge, 'create_invitation', {
    p_room: null,
    p_tournament: t,
    p_role: 'entrant',
    p_hash: secret,
    p_minutes: 60,
  });
  for (const [i, user] of [users.alice, users.bob, eve, fourth].entries())
    await rpc(db, user, 'accept_invitation', { p_hash: secret, p_alias: `Entrant ${i + 1}` });
  let td = await rpc(db, judge, 'tournament_detail', { p_tournament: t });
  td = await rpc(db, judge, 'tournament_command', {
    p_tournament: t,
    p_expected: td.tournament.version,
    p_action: 'seed',
    p_data: {},
  });
  assert.equal(td.matches.length, 3);
  assert.equal(td.matches.filter((m) => m.room_id).length, 2);
  const scheduled = td.matches.find((m) => m.round === 1);
  td = await rpc(db, judge, 'tournament_command', {
    p_tournament: t,
    p_expected: td.tournament.version,
    p_action: 'schedule',
    p_data: { match_id: scheduled.id, scheduled_at: new Date(Date.now() + 3600000).toISOString() },
  });
  for (const match of td.matches.filter((m) => m.round === 1)) {
    for (const user of [match.proposition_id, match.opposition_id])
      await command(match.room_id, 'ready', { ready: true }, user);
    if (match.id === scheduled.id) {
      await assert.rejects(command(match.room_id, 'start'), (e) => e.code === 'PT422');
      td = await rpc(db, judge, 'tournament_command', {
        p_tournament: t,
        p_expected: td.tournament.version,
        p_action: 'schedule',
        p_data: { match_id: match.id, scheduled_at: null },
      });
    }
    await command(match.room_id, 'start');
    await command(
      match.room_id,
      'concede',
      { reason: 'I concede this tournament round after reviewing my position.' },
      match.proposition_id,
    );
    await result(match.room_id);
  }
  td = await rpc(db, judge, 'tournament_detail', { p_tournament: t });
  const final = td.matches.find((m) => m.round === 2);
  assert.ok(final.room_id);
  for (const user of [final.proposition_id, final.opposition_id])
    await command(final.room_id, 'ready', { ready: true }, user);
  await command(final.room_id, 'start');
  await command(
    final.room_id,
    'concede',
    { reason: 'I concede the final round with an explicit recorded decision.' },
    final.proposition_id,
  );
  await result(final.room_id);
  td = await rpc(db, judge, 'tournament_detail', { p_tournament: t });
  assert.equal(td.tournament.status, 'completed');
  assert.equal(td.tournament.winner_id, final.opposition_id);
  assert.equal(td.matches.filter((m) => m.result_id).length, 3);
});
test('advisory ballots require exact two-speaker quotes and simulations cannot award AI-assisted ranking credits', async () => {
  const id = await room();
  await start(id, true);
  const texts = [
    'Reliable service connects homes to jobs.',
    'A universal subsidy can displace service investment.',
  ];
  for (const [position, user] of [users.alice, users.bob].entries()) {
    await command(id, 'speak', {}, user);
    const d = await view(id, user);
    await rpc(db, user, 'room_submit_turn', {
      p_room: id,
      p_expected: d.room.version,
      p_draft: 0,
      p_request: randomUUID(),
      p_text: texts[position],
    });
  }
  await command(id, 'finish', { reason: 'Both opening cases are saved.' });
  const d = await view(id);
  const payload = {
    decision: 'The opening cases remain balanced in this development simulation.',
    clashes: [
      {
        text: 'Compare funding and access.',
        ref: { position: 0, quote: texts[0], start: 0, end: texts[0].length },
      },
    ],
    confidence: 0.5,
    uncertainty: 'Development simulation only. Delivery is not assessed.',
    delivery: null,
  };
  for (const [position, side] of ['proposition', 'opposition'].entries())
    payload[side] = Object.fromEntries(
      ['reasoning', 'evidence', 'structure', 'rebuttal'].map((skill) => [
        skill,
        {
          score: 6,
          rationale: 'Sample text-only score.',
          ref: { position, quote: texts[position], start: 0, end: texts[position].length },
        },
      ]),
    );
  const args = {
    p_room: id,
    p_expected: d.room.version,
    p_request: randomUUID(),
    p_provider: 'mock',
    p_model: 'fixture',
    p_payload: payload,
  };
  const bad = structuredClone(payload);
  bad.proposition.reasoning.ref.quote = 'Invented quotation';
  await assert.rejects(
    rpc(db, judge, 'save_room_ballot', { ...args, p_payload: bad }),
    (e) => e.code === 'PT422',
  );
  await assert.rejects(rpc(db, users.alice, 'save_room_ballot', args), (e) => e.code === '42501');
  const ballot = await rpc(db, judge, 'save_room_ballot', args);
  assert.equal((await rpc(db, judge, 'save_room_ballot', args)).id, ballot.id);
  const updated = await view(id);
  assert.equal(updated.room.version, d.room.version + 1);
  const res = await rpc(db, judge, 'confirm_room_result', {
    p_room: id,
    p_expected: updated.room.version,
    p_request: randomUUID(),
    p_winner: 'draw',
    p_reason: 'I independently reviewed both opening speeches and the simulated advisory example.',
    p_basis: 'ai_assisted',
    p_ballot: ballot.id,
  });
  assert.equal(res.ranked, false);
});
test('deleting a participant removes containing shared records and derived credits, not unrelated rooms', async () => {
  const unrelated = await rpc(db, eve, 'create_room', { p_data: { ...data, alias: 'Unrelated' } });
  await db.query('delete from auth.users where id=$1', [users.alice]);
  assert.equal(
    (await db.query('select * from public.room_memberships where user_id=$1', [users.alice])).rows
      .length,
    0,
  );
  assert.equal((await db.query('select * from public.rankings')).rows.length, 0);
  assert.equal((await db.query('select * from public.tournaments')).rows.length, 0);
  assert.equal((await rpc(db, eve, 'room_detail', { p_room: unrelated })).room.id, unrelated);
});
