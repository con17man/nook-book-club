// Minimal Supabase-like Postgres for testing migrations without Docker.
// Stubs the bits of Supabase the schema relies on: roles, auth.users, auth.uid().
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "migrations");

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text not null,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

export async function createDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  return db;
}

/** Create an auth user (fires the profile trigger) and return its id. */
export async function createUser(db, email, { fullName = email.split("@")[0], role = "member" } = {}) {
  const { rows } = await db.query(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
    [email, JSON.stringify({ full_name: fullName })],
  );
  const id = rows[0].id;
  // Simulate finishing onboarding (set-password page saves the name).
  await db.query(`update public.profiles set full_name = full_name, role = $2 where id = $1`, [id, role]);
  return id;
}

/** Run a query as an authenticated user, the way PostgREST would. */
export async function as(db, userId, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ""]);
    await tx.exec(`set local role ${userId ? "authenticated" : "anon"}`);
    return tx.query(sql, params);
  });
}

/** Run a query as the service role (server-side admin client). */
export async function asService(db, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role service_role`);
    return tx.query(sql, params);
  });
}
