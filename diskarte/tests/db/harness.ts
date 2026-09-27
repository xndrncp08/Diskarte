import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

/** Repository root: supabase/ is shared by diskarte/ and early-access-portal/. */
const root = path.resolve(__dirname, "../../..");
const shim = fs.readFileSync(path.join(__dirname, "supabase-shim.sql"), "utf8");
const migrationsDir = path.join(root, "supabase/migrations");

export type Db = PGlite;

/** Boots an in-memory Postgres with the Supabase shim and every migration applied. */
export async function createDb(): Promise<Db> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(shim);
  for (const file of fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(migrationsDir, file), "utf8"));
  }
  return db;
}

let counter = 0;

/** Inserts an auth.users row (firing the profile trigger) and returns its id. */
export async function signUp(db: Db, email: string, meta: Record<string, unknown> = {}, opts: { verified?: boolean } = {}) {
  counter += 1;
  const id = `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
  await asService(db);
  await db.query("insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values ($1, $2, $3, $4)", [
    id,
    email,
    JSON.stringify(meta),
    opts.verified === false ? null : new Date().toISOString(),
  ]);
  return id;
}

export async function asUser(db: Db, userId: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await db.exec("set role authenticated");
}

export async function asAnon(db: Db) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
  await db.exec("set role anon");
}

export async function asService(db: Db) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
}

export async function rows<T = Record<string, unknown>>(db: Db, sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows;
}

export async function one<T = Record<string, unknown>>(db: Db, sql: string, params: unknown[] = []) {
  const result = await rows<T>(db, sql, params);
  return result[0];
}

/** Resolves with the Postgres error message if the statement fails, or null if it succeeds. */
export async function failure(db: Db, sql: string, params: unknown[] = []): Promise<string | null> {
  try {
    await db.query(sql, params);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
