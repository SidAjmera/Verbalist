// Test-only PostgreSQL runtime. This auth schema models claims for SQL/RLS tests;
// it does not replace Supabase Auth in the application.
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
export async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    grant usage on schema public,auth to anon,authenticated;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant execute on function auth.uid() to anon,authenticated;`);
  const directory = new URL('../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(directory)).filter((f) => f.endsWith('.sql')).sort())
    await db.exec(await readFile(new URL(file, directory), 'utf8'));
  return db;
}
export const users = {
  alice: '00000000-0000-4000-8000-000000000001',
  bob: '00000000-0000-4000-8000-000000000002',
  unverified: '00000000-0000-4000-8000-000000000003',
};
export async function seedUsers(db) {
  for (const [name, id] of Object.entries(users))
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)', [
      id,
      `${name}@example.test`,
      name === 'unverified' ? null : new Date().toISOString(),
    ]);
}
export async function asUser(db, id, fn) {
  return db.transaction(async (tx) => {
    await tx.exec('set local role authenticated');
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
    return fn(tx);
  });
}
export async function rpc(db, id, name, args = {}) {
  if (!/^[a-z_]+$/.test(name)) throw new Error('Invalid RPC');
  const keys = Object.keys(args);
  if (keys.some((k) => !/^p_[a-z_]+$/.test(k))) throw new Error('Invalid RPC argument');
  return asUser(
    db,
    id,
    async (tx) =>
      (
        await tx.query(
          `select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(',')}) as result`,
          Object.values(args).map((v) =>
            typeof v === 'object' && v !== null ? JSON.stringify(v) : v,
          ),
        )
      ).rows[0].result,
  );
}
export const motion = {
  motion: 'This house would make public transport free in major cities.',
  side: 'proposition',
  difficulty: 'intermediate',
  persona: 'analyst',
  preparation_seconds: 60,
  speaking_seconds: 120,
};
export const root = fileURLToPath(new URL('../', import.meta.url));
