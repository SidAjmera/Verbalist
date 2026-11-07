/** TEST ONLY. Simulates Supabase Auth/PostgREST over real PostgreSQL (PGlite).
 * No application code imports this. Never expose beyond loopback.
 * A fixed test password is accepted; this cannot send email or contact Google.
 */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { database, seedUsers, asUser, rpc } from '../db-harness.mjs';
const db = await database();
await seedUsers(db);
const sessions = new Map(),
  confirmations = new Map();
const columns = {
  profiles: ['id', 'version'],
  user_preferences: ['id', 'user_id', 'version'],
  debate_formats: ['id', 'enabled'],
  debate_sessions: ['id', 'owner_id', 'status'],
  debate_participants: ['id', 'owner_id', 'session_id'],
  debate_turns: ['id', 'owner_id', 'session_id'],
  analysis_runs: ['id', 'owner_id', 'session_id', 'request_id'],
  arguments: ['id', 'owner_id', 'session_id', 'run_id'],
  argument_links: ['id', 'owner_id', 'session_id', 'run_id'],
  judge_ballots: ['id', 'owner_id', 'session_id', 'run_id'],
  feedback_reports: ['id', 'owner_id', 'session_id', 'run_id'],
  factual_claims: ['id', 'owner_id', 'session_id', 'run_id'],
  evidence_sources: ['id', 'owner_id', 'claim_id'],
  practice_drills: ['id'],
  drill_attempts: ['id', 'owner_id', 'drill_id', 'request_id'],
  user_progress: ['id', 'owner_id'],
  achievements: ['id', 'owner_id'],
  debate_rooms: ['id', 'owner_id', 'status'],
  room_memberships: ['id', 'room_id', 'user_id'],
  room_drafts: ['id', 'room_id', 'user_id'],
  room_turns: ['id', 'room_id'],
  room_events: ['id', 'room_id'],
  room_ballots: ['id', 'room_id', 'request_id'],
  room_results: ['id', 'room_id'],
  tournaments: ['id', 'owner_id'],
  tournament_entries: ['id', 'tournament_id', 'user_id'],
  tournament_matches: ['id', 'tournament_id'],
  ranking_profiles: ['id', 'user_id'],
  rankings: ['id', 'user_id'],
  mun_committees: ['id', 'owner_id'],
  mun_delegates: ['id', 'owner_id', 'committee_id'],
  mun_messages: ['id', 'owner_id', 'committee_id', 'request_id'],
  mun_drafts: ['id', 'owner_id', 'committee_id'],
};
const orderColumns = new Set(['id', 'position', 'updated_at', 'created_at']);
function jwt(id) {
  const encode = (data) => Buffer.from(JSON.stringify(data)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, role: 'authenticated', aud: 'authenticated', iss: 'http://127.0.0.1:54400/auth/v1', exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000), session_id: randomUUID(), amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }], is_anonymous: false })}.test-signature`;
}
async function userData(id) {
  const row = (await db.query('select * from auth.users where id=$1', [id])).rows[0];
  return row
    ? {
        id: row.id,
        email: row.email,
        aud: 'authenticated',
        role: 'authenticated',
        email_confirmed_at: row.email_confirmed_at,
        confirmed_at: row.email_confirmed_at,
        is_anonymous: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        identities: [],
      }
    : null;
}
async function newSession(id) {
  const token = jwt(id);
  sessions.set(token, id);
  return {
    access_token: token,
    refresh_token: `fixture-refresh-${randomUUID()}`,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: await userData(id),
  };
}
const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || 'http://127.0.0.1:3100');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'authorization,apikey,content-type,x-client-info,x-supabase-api-version',
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Content-Type', 'application/json');
  const reply = (status, data) => {
    res.statusCode = status;
    res.end(JSON.stringify(data));
  };
  if (req.method === 'OPTIONS') return reply(200, {});
  const url = new URL(req.url, 'http://127.0.0.1:54400');
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 65536) return reply(413, {});
      chunks.push(chunk);
    }
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    const token = req.headers.authorization?.replace(/^Bearer /i, '');
    const id = sessions.get(token);
    const user = id ? await userData(id) : null;
    if (url.pathname === '/health') return reply(200, { fixture: true });
    if (url.pathname === '/auth/v1/signup') {
      if ((await db.query('select id from auth.users where email=$1', [body.email])).rows.length)
        return reply(400, { msg: 'Account already exists' });
      const newId = randomUUID();
      await db.query('insert into auth.users(id,email) values($1,$2)', [newId, body.email]);
      const hash = randomUUID();
      confirmations.set(hash, { id: newId, type: 'signup' });
      return reply(200, await userData(newId));
    }
    if (url.pathname === '/__test/confirmation') {
      const row = (await db.query('select id from auth.users where email=$1', [body.email]))
        .rows[0];
      if (!row) return reply(404, {});
      return reply(200, { hash: [...confirmations].find(([, value]) => value.id === row.id)?.[0] });
    }
    if (url.pathname === '/auth/v1/verify') {
      const confirmation = confirmations.get(body.token_hash);
      if (!confirmation) return reply(403, { msg: 'Invalid token' });
      await db.query('update auth.users set email_confirmed_at=now() where id=$1', [
        confirmation.id,
      ]);
      confirmations.delete(body.token_hash);
      return reply(200, await newSession(confirmation.id));
    }
    if (url.pathname === '/auth/v1/token') {
      const row = (
        await db.query('select id,email_confirmed_at from auth.users where email=$1', [body.email])
      ).rows[0];
      if (!row || body.password !== 'fixture-password-123' || !row.email_confirmed_at)
        return reply(400, {
          error: 'invalid_grant',
          error_description: 'Email or password invalid',
          code: 'invalid_credentials',
        });
      return reply(200, await newSession(row.id));
    }
    if (url.pathname === '/auth/v1/recover') return reply(200, {});
    if (url.pathname === '/auth/v1/user') {
      if (!user) return reply(401, { msg: 'Session expired' });
      return reply(200, user);
    }
    if (url.pathname === '/auth/v1/logout') {
      if (id) {
        for (const [key, value] of sessions) if (value === id) sessions.delete(key);
      }
      return reply(200, {});
    }
    if (url.pathname.startsWith('/auth/v1/admin/users/') && req.method === 'DELETE') {
      if (token !== 'fixture-secret') return reply(403, {});
      await db.query('delete from auth.users where id=$1', [url.pathname.split('/').at(-1)]);
      return reply(200, {});
    }
    if (!user) return reply(401, { code: '42501', message: 'Sign in' });
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const name = url.pathname.split('/').at(-1);
      if (
        !new Set([
          'consume_budget',
          'create_debate',
          'append_turn',
          'save_draft',
          'change_status',
          'update_account',
          'dashboard_stats',
          'start_speaking',
          'analysis_detail',
          'save_analysis',
          'learning_progress',
          'save_drill_attempt',
          'save_research',
          'room_detail',
          'create_room',
          'create_invitation',
          'accept_invitation',
          'room_command',
          'room_save_draft',
          'room_submit_turn',
          'create_tournament',
          'tournament_detail',
          'tournament_command',
          'save_room_ballot',
          'confirm_room_result',
          'set_ranking_profile',
          'practice_leaderboard',
          'room_connect',
          'room_voice',
          'room_send_signal',
          'room_live_tick',
          'room_disconnect',
          'create_mun',
          'mun_detail',
          'mun_save_draft',
          'mun_append',
          'mun_command',
        ]).has(name)
      )
        return reply(404, {});
      return reply(200, await rpc(db, id, name, body));
    }
    if (url.pathname.startsWith('/rest/v1/') && req.method === 'GET') {
      const table = url.pathname.split('/').at(-1);
      if (!columns[table]) return reply(404, {});
      const where = [],
        values = [];
      for (const [column, value] of url.searchParams) {
        if (['select', 'order', 'limit', 'offset'].includes(column)) continue;
        if (!columns[table].includes(column) || !value.startsWith('eq.'))
          throw new Error('Unsupported filter');
        values.push(value.slice(3));
        where.push(`${column}=$${values.length}`);
      }
      const orders = (url.searchParams.get('order') || 'id.asc').split(',').map((order) => {
        const [column, direction] = order.split('.');
        if (!orderColumns.has(column) || !['asc', 'desc'].includes(direction))
          throw new Error('Unsupported order');
        return `${column} ${direction}`;
      });
      const limit = Math.min(1000, Math.max(0, Number(url.searchParams.get('limit') || 1000))),
        offset = Math.max(0, Number(url.searchParams.get('offset') || 0));
      if (!Number.isInteger(limit) || !Number.isInteger(offset)) throw new Error('Bad pagination');
      const result = await asUser(db, id, (tx) =>
        tx.query(
          `select * from public.${table} ${where.length ? 'where ' + where.join(' and ') : ''} order by ${orders.join(',')} limit ${limit} offset ${offset}`,
          values,
        ),
      );
      return reply(200, result.rows);
    }
    return reply(404, { message: 'Unsupported fixture endpoint' });
  } catch (error) {
    return reply(
      { PT409: 409, PT404: 404, PT422: 422, PT429: 429, 42501: 403, 23505: 409, 23514: 422 }[
        error.code
      ] || 500,
      { code: error.code || 'fixture_error', message: 'Fixture request failed' },
    );
  }
});
server.listen(54400, '127.0.0.1', () =>
  console.log('Test-only Auth/PostgREST fixture: http://127.0.0.1:54400'),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => server.close(() => void db.close().then(() => process.exit(0))));
