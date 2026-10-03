// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

const HQ = "d15ca47e-0000-4000-8000-000000000001";
const ANNOUNCEMENTS = "d15ca47e-0000-4000-8000-0000000000a1";
const LOUNGE = "d15ca47e-0000-4000-8000-0000000000a2";

let db: Db;
let creator: string;
let juan: string;

async function post(userId: string, channelId: string, content: string) {
  await asUser(db, userId);
  return failure(db, "insert into public.messages (channel_id, author_id, content) values ($1, $2, $3)", [channelId, userId, content]);
}

beforeAll(async () => {
  db = await createDb();
  creator = await signUp(db, "creator@diskarte.ph", { username: "creator" });
  await asService(db);
  await db.query("insert into public.platform_admins (user_id) values ($1)", [creator]);
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
}, 60_000);

describe("Diskarte HQ (global super server)", () => {
  it("exists once, owned by nobody, with a read-only announcements channel and an open lounge", async () => {
    await asService(db);
    expect(await one(db, "select name, owner_id, is_system from public.servers where id = $1", [HQ])).toEqual({ name: "Diskarte HQ", owner_id: null, is_system: true });
    const channels = await rows<{ name: string; read_only: boolean; slowmode_seconds: number }>(db, "select name, read_only, slowmode_seconds from public.channels where server_id = $1 order by position", [HQ]);
    expect(channels).toEqual([
      { name: "announcements", read_only: true, slowmode_seconds: 0 },
      { name: "global-lounge", read_only: false, slowmode_seconds: 5 },
    ]);
    expect(await failure(db, "insert into public.servers (name, owner_id, is_system) values ('Second HQ', $1, true)", [juan])).toMatch(/duplicate key|unique/);
  });

  it("signing up adds a members record automatically — creators as admins", async () => {
    await asService(db);
    expect(await one(db, "select role from public.members where server_id = $1 and user_id = $2", [HQ, juan])).toEqual({ role: "member" });
    expect(await one(db, "select role from public.members where server_id = $1 and user_id = $2", [HQ, creator])).toEqual({ role: "admin" });
    // Automatic joins don't flood the audit log.
    expect(await rows(db, "select 1 from public.audit_logs where server_id = $1 and action = 'member.join'", [HQ])).toHaveLength(0);
  });

  it("backfills accounts that existed before HQ, idempotently", async () => {
    const old = await signUp(db, "old@diskarte.ph", { username: "matagal" });
    await asService(db);
    await db.query("delete from public.members where server_id = $1 and user_id = $2", [HQ, old]);
    expect((await one<{ n: number }>(db, "select public.join_everyone_to_system_server() n")).n).toBe(1);
    expect((await one<{ n: number }>(db, "select public.join_everyone_to_system_server() n")).n).toBe(0);
    expect(await rows(db, "select 1 from public.members where server_id = $1 and user_id = $2", [HQ, old])).toHaveLength(1);
    await asUser(db, juan);
    expect(await failure(db, "select public.join_everyone_to_system_server()")).toMatch(/permission denied/);
  });

  it("only creators post in #announcements; everyone chats in #global-lounge", async () => {
    expect(await post(juan, ANNOUNCEMENTS, "Pa-shoutout po")).toMatch(/READ_ONLY_CHANNEL/);
    expect(await post(creator, ANNOUNCEMENTS, "v1.4: floating windows are here!")).toBeNull();
    expect(await post(juan, LOUNGE, "Mabuhay, Diskarte!")).toBeNull();
    await asUser(db, juan);
    expect(await rows<{ content: string }>(db, "select content from public.messages where channel_id = $1", [ANNOUNCEMENTS])).toEqual([{ content: "v1.4: floating windows are here!" }]);
  });

  it("nobody can leave, delete it or take it over", async () => {
    await asUser(db, juan);
    expect(await failure(db, "delete from public.members where server_id = $1 and user_id = $2", [HQ, juan])).toMatch(/CANNOT_LEAVE_SYSTEM_SERVER/);
    expect(await failure(db, "update public.members set role = 'admin' where server_id = $1 and user_id = $2", [HQ, juan])).toMatch(/ONLY_ADMINS_CAN_CHANGE_ROLES|CANNOT_CHANGE_OWN_ROLE/);
    await db.query("delete from public.servers where id = $1", [HQ]);
    await asUser(db, creator);
    await db.query("delete from public.servers where id = $1", [HQ]);
    expect(await failure(db, "update public.servers set owner_id = $1 where id = $2", [creator, HQ])).toMatch(/SYSTEM_SERVER_IMMUTABLE/);
    expect(await failure(db, "update public.servers set is_system = false where id = $1", [HQ])).toMatch(/SYSTEM_SERVER_IMMUTABLE/);
    await asService(db);
    expect(await rows(db, "select 1 from public.servers where id = $1 and owner_id is null", [HQ])).toHaveLength(1);
  });

  it("revoking a creator demotes them to a regular member", async () => {
    await asService(db);
    await db.query("delete from public.platform_admins where user_id = $1", [creator]);
    expect(await one(db, "select role from public.members where server_id = $1 and user_id = $2", [HQ, creator])).toEqual({ role: "member" });
    expect(await post(creator, ANNOUNCEMENTS, "one more")).toMatch(/READ_ONLY_CHANNEL/);
  });
});
