// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let owner: string;
let mod: string;
let juan: string;
let a: string;
let b: string;
let serverId: string;

beforeAll(async () => {
  db = await createDb();
  owner = await signUp(db, "owner@diskarte.ph", { username: "kapitan" });
  mod = await signUp(db, "mod@diskarte.ph", { username: "tanod" });
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
  a = await signUp(db, "a@diskarte.ph", { username: "aaa" });
  b = await signUp(db, "b@diskarte.ph", { username: "bbb" });
  await asUser(db, owner);
  serverId = (await one<{ id: string }>(db, "select public.create_server('Barkada', '') as id")).id;
  const { invite_code } = await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [serverId]);
  for (const u of [mod, juan]) {
    await asUser(db, u);
    await db.query("select public.join_server($1)", [invite_code]);
  }
  await asUser(db, owner);
  await db.query("update public.members set role = 'moderator' where server_id = $1 and user_id = $2", [serverId, mod]);
}, 60_000);

const create = async (as: string, minutes: number, uses: number) => {
  await asUser(db, as);
  return (await one<{ code: string }>(db, "select public.create_invite($1, $2, $3) as code", [serverId, minutes, uses])).code;
};

describe("invites", () => {
  it("lets members create limited invites, and uses them up", async () => {
    const code = await create(juan, 30, 1);
    expect(await failure(db, "select public.create_invite($1, 45, 0)", [serverId])).toMatch(/INVALID_INVITE_SETTINGS/);
    await asUser(db, a);
    expect(await failure(db, "select public.create_invite($1, 30, 0)", [serverId])).toMatch(/CANNOT_CREATE_INVITE/);
    expect(await one(db, "select name from public.get_invite($1)", [code.toLowerCase()])).toEqual({ name: "Barkada" });
    // An existing member opening it doesn't use it up.
    await asUser(db, mod);
    await db.query("select public.join_server($1)", [code]);
    expect(await one(db, "select uses from public.server_invites where code = $1", [code])).toEqual({ uses: 0 });
    await asUser(db, a);
    await db.query("select public.join_server($1)", [code]);
    await asUser(db, juan);
    expect(await one(db, "select uses from public.server_invites where code = $1", [code])).toEqual({ uses: 1 });
    // Used up: no preview, no joining.
    await asUser(db, b);
    expect(await rows(db, "select name from public.get_invite($1)", [code])).toEqual([]);
    expect(await failure(db, "select public.join_server($1)", [code])).toMatch(/INVITE_NOT_FOUND/);
  });

  it("expires", async () => {
    const code = await create(juan, 60, 0);
    await asService(db);
    await db.query("update public.server_invites set expires_at = now() - interval '1 second' where code = $1", [code]);
    await asUser(db, b);
    expect(await failure(db, "select public.join_server($1)", [code])).toMatch(/INVITE_NOT_FOUND/);
  });

  it("shows invites to their creator and moderators, who can revoke them", async () => {
    const code = await create(juan, 0, 0);
    await asUser(db, owner);
    const mine = await create(owner, 0, 0);
    await asUser(db, juan);
    expect((await rows<{ code: string }>(db, "select code from public.server_invites")).map((r) => r.code)).not.toContain(mine);
    expect(await failure(db, "select public.revoke_invite($1)", [mine])).toMatch(/CANNOT_REVOKE_INVITE/);
    expect(await failure(db, "delete from public.server_invites where code = $1", [code])).toMatch(/permission denied/);
    await asUser(db, mod);
    expect((await rows<{ code: string }>(db, "select code from public.server_invites")).map((r) => r.code)).toEqual(expect.arrayContaining([code, mine]));
    await db.query("select public.revoke_invite($1)", [code]);
    await asUser(db, b);
    expect(await failure(db, "select public.join_server($1)", [code])).toMatch(/INVITE_NOT_FOUND/);
  });
});
