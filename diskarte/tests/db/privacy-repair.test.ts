// @vitest-environment node
// Rehearses docs/sql/privacy-repair.sql (the production bundle) on a database that stopped before
// the privacy migrations and already holds the data production has: legacy Invisible profiles and
// audit rows about public, private and deleted channels.
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createDb, one, rows, signUp, type Db } from "./harness";

const bundle = fs.readFileSync(path.join(__dirname, "../../docs/sql/privacy-repair.sql"), "utf8");
const migration = (name: string) => fs.readFileSync(path.join(__dirname, "../../../supabase/migrations", name), "utf8");

let db: Db;
let owner: string;
let mod: string; // moderator with no grant on the private channel
let ghost: string; // legacy Invisible, no privacy_settings row
let shy: string; // legacy Invisible, already has a privacy_settings row
let serverId: string;
let general: string;
let secret: string;
let gone: string; // private channel deleted before the repair

/** Runs the bundle; on failure ends the aborted transaction, like a fresh SQL-editor connection would. */
async function apply(sql = bundle) {
  await asService(db);
  try {
    await db.exec(sql);
    return null;
  } catch (err) {
    await db.exec("rollback");
    return err instanceof Error ? err.message : String(err);
  }
}

async function snapshot() {
  await asService(db);
  return {
    profiles: await rows(db, "select id, status, updated_at from public.profiles order by id"),
    privacy: await rows(db, "select to_jsonb(ps) as row from public.privacy_settings ps order by user_id"),
    audit: await rows(db, "select to_jsonb(a) as row from public.audit_logs a order by id"),
  };
}

beforeAll(async () => {
  db = await createDb({ before: "20261109000000" });
  owner = await signUp(db, "owner@diskarte.ph", { username: "kapitan" });
  mod = await signUp(db, "mod@diskarte.ph", { username: "bantay" });
  ghost = await signUp(db, "ghost@diskarte.ph", { username: "multo" });
  shy = await signUp(db, "shy@diskarte.ph", { username: "mahiyain" });

  await asUser(db, owner);
  serverId = (await one<{ id: string }>(db, "select public.create_server('Barkada', 'Tropa') as id")).id;
  const { invite_code } = await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [serverId]);
  for (const u of [mod, ghost, shy]) {
    await asUser(db, u);
    await db.query("select public.join_server($1)", [invite_code]);
  }
  await asUser(db, owner);
  await db.query("update public.members set role = 'moderator' where server_id = $1 and user_id = $2", [serverId, mod]);
  general = (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and type = 'text' order by position limit 1", [serverId])).id;
  secret = (await one<{ id: string }>(db, "insert into public.channels (server_id, name, type, is_private) values ($1, 'vip', 'text', true) returning id", [serverId])).id;
  gone = (await one<{ id: string }>(db, "insert into public.channels (server_id, name, type, is_private) values ($1, 'old-vip', 'text', true) returning id", [serverId])).id;
  await db.query("update public.channels set topic = 'tambay' where id = $1", [general]);
  await db.query("delete from public.channels where id = $1", [gone]);

  await asService(db);
  await db.query(
    "insert into public.audit_logs (server_id, actor_id, action, target_type, target_id, metadata) values ($1, $2, 'message.delete', 'message', gen_random_uuid(), jsonb_build_object('channel_id', $3::text, 'excerpt', 'lihim'))",
    [serverId, mod, secret],
  );
  // Legacy Invisible, set the way old clients did; shy already has an unrelated privacy row.
  await db.query("insert into public.privacy_settings (user_id, friend_requests_from) values ($1, 'nobody')", [shy]);
  await db.query("update public.profiles set status = 'invisible' where id = any($1)", [[ghost, shy]]);
}, 60_000);

describe("privacy repair bundle", () => {
  it("contains both migrations verbatim", () => {
    expect(bundle).toContain(migration("20261109000000_privacy_hardening.sql"));
    expect(bundle).toContain(migration("20261109020000_avatar_listing.sql"));
  });

  it("rolls back completely when anything fails before COMMIT", async () => {
    const before = await snapshot();
    const error = await apply(bundle.replace(/\ncommit;\s*$/, "\nselect 1 / 0;\ncommit;\n"));
    expect(error).toMatch(/division by zero/);
    expect(await snapshot()).toEqual(before);
    expect(await rows(db, "select 1 from information_schema.columns where table_name = 'privacy_settings' and column_name = 'invisible'")).toEqual([]);
  });

  it("applies once, keeping every Invisible choice private without touching public timestamps", async () => {
    const before = await snapshot();
    expect(await apply()).toBeNull();
    const after = await snapshot();

    expect(after.audit).toHaveLength(before.audit.length);
    expect(after.profiles.map((p) => p.id)).toEqual(before.profiles.map((p) => p.id));
    for (const p of before.profiles) {
      const now = after.profiles.find((q) => q.id === p.id)!;
      expect(now.updated_at).toEqual(p.updated_at);
      expect(now.status).toBe(p.status === "invisible" ? "online" : p.status);
    }
    expect(await rows(db, "select user_id, invisible, friend_requests_from from public.privacy_settings where invisible order by user_id")).toEqual(
      [
        { user_id: ghost, invisible: true, friend_requests_from: "everyone" },
        { user_id: shy, invisible: true, friend_requests_from: "nobody" },
      ].sort((a, b) => a.user_id.localeCompare(b.user_id)),
    );

    // The app learns its real status from the heartbeat.
    await asUser(db, ghost);
    const beat = await one<{ r: { invisible: boolean; status: string } }>(
      db,
      "select public.heartbeat_device(gen_random_uuid(), '0123456789abcdef', 'Phone', 'online') as r",
    );
    expect(beat.r).toMatchObject({ invisible: true, status: "online" });
  });

  it("tags old audit rows so moderators only read channels they can view", async () => {
    await asService(db);
    const tagged = await rows<{ action: string; channel_id: string | null; channel_private: boolean }>(
      db,
      "select action, channel_id, channel_private from public.audit_logs where channel_id is not null order by id",
    );
    expect(tagged).toEqual(
      expect.arrayContaining([
        { action: "channel.update", channel_id: general, channel_private: false },
        { action: "channel.create", channel_id: secret, channel_private: true },
        { action: "channel.delete", channel_id: gone, channel_private: true },
        { action: "message.delete", channel_id: secret, channel_private: true },
      ]),
    );

    const about = async (user: string) => {
      await asUser(db, user);
      return (await rows<{ channel_id: string }>(db, "select distinct channel_id from public.audit_logs where channel_id is not null")).map((r) => r.channel_id).sort();
    };
    expect(await about(mod)).toEqual([general]);
    expect(await about(owner)).toEqual([general, secret, gone].sort());
  });

  it("refuses a database that is missing earlier migrations (e.g. Hangouts)", async () => {
    const older = await createDb({ before: "20261108000000" });
    await expect(older.exec(bundle)).rejects.toThrow(/preflight failed: missing function public\.friends_activity\(\)/);
    await older.exec("rollback");
    expect(await rows(older, "select 1 from information_schema.columns where table_name = 'audit_logs' and column_name = 'channel_id'")).toEqual([]);
  }, 60_000);

  it("refuses to run a second time and changes nothing", async () => {
    const before = await snapshot();
    expect(await apply()).toMatch(/preflight failed: .*already exists/);
    expect(await snapshot()).toEqual(before);
  });
});
