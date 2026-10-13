// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let owner: string;
let mod: string;
let admin: string;
let juan: string;
let serverId: string;
let general: string;
let firstMessage: string;

beforeAll(async () => {
  db = await createDb();
  owner = await signUp(db, "owner@diskarte.ph", { username: "kapitan" });
  mod = await signUp(db, "mod@diskarte.ph", { username: "tanod" });
  admin = await signUp(db, "admin@diskarte.ph", { username: "kagawad" });
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
  await asUser(db, owner);
  serverId = (await one<{ id: string }>(db, "select public.create_server('Barkada', '') as id")).id;
  const { invite_code } = await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [serverId]);
  for (const u of [mod, admin, juan]) {
    await asUser(db, u);
    await db.query("select public.join_server($1)", [invite_code]);
  }
  await asUser(db, owner);
  await db.query("update public.members set role = 'moderator' where server_id = $1 and user_id = $2", [serverId, mod]);
  await db.query("update public.members set role = 'admin' where server_id = $1 and user_id = $2", [serverId, admin]);
  general = (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and type = 'text' order by position limit 1", [serverId])).id;
  firstMessage = (await one<{ id: string }>(db, "insert into public.messages (channel_id, author_id, content) values ($1, $2, 'hello') returning id", [general, owner])).id;
}, 60_000);

const send = (author: string) => db.query("insert into public.messages (channel_id, author_id, content) values ($1, $2, 'hi')", [general, author]);

describe("timeouts", () => {
  it("lets moderators time out members below them, never admins, the owner or themselves", async () => {
    await asUser(db, juan);
    expect(await failure(db, "select public.timeout_member($1, $2, 10)", [serverId, mod])).toMatch(/CANNOT_TIMEOUT_MEMBER/);
    await asUser(db, mod);
    expect(await failure(db, "select public.timeout_member($1, $2, 10)", [serverId, admin])).toMatch(/CANNOT_TIMEOUT_MEMBER/);
    expect(await failure(db, "select public.timeout_member($1, $2, 10)", [serverId, owner])).toMatch(/CANNOT_TIMEOUT_MEMBER/);
    expect(await failure(db, "select public.timeout_member($1, $2, 10)", [serverId, mod])).toMatch(/CANNOT_TIMEOUT_MEMBER/);
    expect(await failure(db, "select public.timeout_member($1, $2, 7)", [serverId, juan])).toMatch(/INVALID_TIMEOUT/);
    await asUser(db, owner);
    expect(await failure(db, "select public.timeout_member($1, $2, 10)", [serverId, admin])).toMatch(/CANNOT_TIMEOUT_MEMBER/);
    await db.query("select public.timeout_member($1, $2, 60)", [serverId, mod]);
    await db.query("select public.remove_timeout($1, $2)", [serverId, mod]);
  });

  it("stops a timed-out member sending, reacting and clearing it themselves, then lifts", async () => {
    await asUser(db, mod);
    await db.query("select public.timeout_member($1, $2, 10, 'spam')", [serverId, juan]);
    await asUser(db, juan);
    expect(await failure(db, "insert into public.messages (channel_id, author_id, content) values ($1, $2, 'hi')", [general, juan])).toMatch(/TIMED_OUT/);
    expect(await failure(db, "insert into public.reactions (message_id, user_id, emoji) values ($1, $2, '👍')", [firstMessage, juan])).toMatch(/TIMED_OUT/);
    expect(await failure(db, "select public.create_poll($1, 'Q', array['a','b'], false, 24)", [general])).toMatch(/TIMED_OUT/);
    expect(await failure(db, "update public.members set timeout_until = null where server_id = $1 and user_id = $2", [serverId, juan])).toMatch(/USE_TIMEOUT_RPC/);
    expect((await one<{ t: boolean }>(db, "select public.member_timed_out($1, $2) as t", [serverId, juan])).t).toBe(true);
    // Still reads the channel.
    expect((await rows(db, "select id from public.messages where channel_id = $1", [general])).length).toBeGreaterThan(0);
    // Others are unaffected.
    await asUser(db, mod);
    await send(mod);
    expect((await rows(db, "select action from public.audit_logs where server_id = $1 and action = 'member.timeout'", [serverId])).length).toBeGreaterThan(0);
    await db.query("select public.remove_timeout($1, $2)", [serverId, juan]);
    await asUser(db, juan);
    await send(juan);
  });

  it("expires on its own", async () => {
    await asUser(db, mod);
    await db.query("select public.timeout_member($1, $2, 1)", [serverId, juan]);
    await db.exec("reset role");
    await db.query("update public.members set timeout_until = now() - interval '1 second' where server_id = $1 and user_id = $2", [serverId, juan]);
    await asUser(db, juan);
    await send(juan);
  });
});

describe("warnings", () => {
  it("lets moderators warn members below them; the member sees and dismisses it", async () => {
    await asUser(db, juan);
    expect(await failure(db, "select public.warn_member($1, $2, 'no')", [serverId, mod])).toMatch(/CANNOT_WARN_MEMBER/);
    expect(await failure(db, "insert into public.member_warnings (server_id, user_id, reason) values ($1, $2, 'x')", [serverId, juan])).toMatch(/permission denied/);
    await asUser(db, mod);
    expect(await failure(db, "select public.warn_member($1, $2, '  ')", [serverId, juan])).toMatch(/INVALID_WARNING/);
    expect(await failure(db, "select public.warn_member($1, $2, 'x')", [serverId, admin])).toMatch(/CANNOT_WARN_MEMBER/);
    await db.query("select public.warn_member($1, $2, 'Bawal ang spam')", [serverId, juan]);

    await asUser(db, admin);
    expect(await rows(db, "select reason from public.member_warnings where server_id = $1", [serverId])).toEqual([{ reason: "Bawal ang spam" }]);
    // Another member can't see it.
    const other = await signUp(db, "other@diskarte.ph", { username: "other" });
    const { invite_code } = await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [serverId]);
    await asUser(db, other);
    await db.query("select public.join_server($1)", [invite_code]);
    expect(await rows(db, "select id from public.member_warnings")).toEqual([]);

    await asUser(db, juan);
    expect(await rows(db, "select reason from public.member_warnings where acknowledged_at is null")).toEqual([{ reason: "Bawal ang spam" }]);
    await db.query("select public.acknowledge_warnings($1)", [serverId]);
    expect(await rows(db, "select id from public.member_warnings where acknowledged_at is null")).toEqual([]);
  });
});
