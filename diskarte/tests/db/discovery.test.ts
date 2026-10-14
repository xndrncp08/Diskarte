// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let owner: string;
let juan: string;
let banned: string;
let listed: string;
let hidden: string;

beforeAll(async () => {
  db = await createDb();
  owner = await signUp(db, "owner@diskarte.ph", { username: "kapitan" });
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
  banned = await signUp(db, "bad@diskarte.ph", { username: "troll" });
  await asUser(db, owner);
  listed = (await one<{ id: string }>(db, "select public.create_server('Valorant PH', 'Ranked grind every night') as id")).id;
  hidden = (await one<{ id: string }>(db, "select public.create_server('Secret Barkada', '') as id")).id;
  await db.query("update public.servers set is_public = true, category = 'gaming' where id = $1", [listed]);
  await asService(db);
  await db.query("insert into public.server_bans (server_id, user_id, banned_by, reason) values ($1, $2, $3, 'spam')", [listed, banned, owner]);
}, 60_000);

describe("server discovery", () => {
  it("lists only public servers, with search and category filters", async () => {
    await asUser(db, juan);
    const all = await rows<{ name: string; is_member: boolean; member_count: number }>(db, "select name, is_member, member_count from public.discover_servers()");
    expect(all.map((s) => s.name)).toEqual(["Valorant PH"]);
    expect(all[0]).toMatchObject({ is_member: false });
    expect(await rows(db, "select name from public.discover_servers('ranked')")).toEqual([{ name: "Valorant PH" }]);
    expect(await rows(db, "select name from public.discover_servers('', 'study')")).toEqual([]);
    expect(await rows(db, "select name from public.discover_servers('secret')")).toEqual([]);
    // Listing is admin-only: RLS hides the row from anyone else's update.
    await db.query("update public.servers set is_public = true where id = $1", [hidden]);
    expect(await rows(db, "select name from public.discover_servers('secret')")).toEqual([]);
  });

  it("joins a listed server without an invite, but never an unlisted one or past a ban", async () => {
    await asUser(db, juan);
    await db.query("select public.join_public_server($1)", [listed]);
    expect(await one(db, "select is_member from public.discover_servers() where id = $1", [listed])).toEqual({ is_member: true });
    expect(await failure(db, "select public.join_public_server($1)", [hidden])).toMatch(/INVITE_NOT_FOUND/);
    await asUser(db, banned);
    expect(await failure(db, "select public.join_public_server($1)", [listed])).toMatch(/BANNED/);
  });
});
