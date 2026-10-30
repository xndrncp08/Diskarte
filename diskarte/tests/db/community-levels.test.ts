// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let owner: string;
let juan: string;
let outsider: string;
let serverId: string;
let general: string;

let n = 0;
// Distinct text each time: auto-mod drops repeated identical messages as spam.
const send = (author: string) => db.query("insert into public.messages (channel_id, author_id, content) values ($1, $2, $3)", [general, author, `kumusta ${++n}`]);
const xp = async (user: string) => (await rows<{ xp: number }>(db, "select xp from public.member_xp where server_id = $1 and user_id = $2", [serverId, user]))[0]?.xp ?? 0;

beforeAll(async () => {
  db = await createDb();
  owner = await signUp(db, "owner@diskarte.ph", { username: "kapitan" });
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
  outsider = await signUp(db, "out@diskarte.ph", { username: "dayo" });
  await asUser(db, owner);
  serverId = (await one<{ id: string }>(db, "select public.create_server('Barkada', '') as id")).id;
  const { invite_code } = await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [serverId]);
  await asUser(db, juan);
  await db.query("select public.join_server($1)", [invite_code]);
  general = (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and type = 'text' order by position limit 1", [serverId])).id;
}, 60_000);

describe("community levels", () => {
  it("earn nothing until an admin turns them on", async () => {
    await asUser(db, juan);
    await send(juan);
    expect(await xp(juan)).toBe(0);
    // Only admins can switch them on.
    await db.query("update public.servers set levels_enabled = true where id = $1", [serverId]);
    await asUser(db, owner);
    expect(await one(db, "select levels_enabled from public.servers where id = $1", [serverId])).toEqual({ levels_enabled: false });
    await db.query("update public.servers set levels_enabled = true where id = $1", [serverId]);
  });

  it("award XP at most once a minute, readable only by members", async () => {
    await asUser(db, juan);
    await send(juan);
    await send(juan);
    expect(await xp(juan)).toBe(15);
    await asService(db);
    await db.query("update public.member_xp set last_award_at = now() - interval '61 seconds' where user_id = $1", [juan]);
    await asUser(db, juan);
    await send(juan);
    expect(await xp(juan)).toBe(30);
    // Members can't grant themselves XP.
    expect(await failure(db, "update public.member_xp set xp = 9999 where user_id = $1", [juan])).toBeTruthy();
    await asUser(db, outsider);
    expect(await rows(db, "select 1 from public.member_xp")).toHaveLength(0);
  });

  it("can be reset by admins only", async () => {
    await asUser(db, juan);
    expect(await failure(db, "select public.reset_server_xp($1)", [serverId])).toMatch(/NOT_ALLOWED/);
    await asUser(db, owner);
    await db.query("select public.reset_server_xp($1)", [serverId]);
    expect(await xp(juan)).toBe(0);
  });
});
