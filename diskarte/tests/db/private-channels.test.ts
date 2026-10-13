// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let owner: string;
let mod: string;
let juan: string;
let maria: string;
let serverId: string;
let vip: string;

beforeAll(async () => {
  db = await createDb();
  owner = await signUp(db, "owner@diskarte.ph", { username: "kapitan" });
  mod = await signUp(db, "mod@diskarte.ph", { username: "bantay" });
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
  maria = await signUp(db, "maria@diskarte.ph", { username: "maria" });
  await asUser(db, owner);
  serverId = (await one<{ id: string }>(db, "select public.create_server('Barkada', 'Tropa') as id")).id;
  const { invite_code } = await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [serverId]);
  for (const u of [mod, juan, maria]) {
    await asUser(db, u);
    await db.query("select public.join_server($1)", [invite_code]);
  }
  await asUser(db, owner);
  await db.query("update public.members set role = 'moderator' where server_id = $1 and user_id = $2", [serverId, mod]);
  vip = (await one<{ id: string }>(db, "insert into public.channels (server_id, name, type, is_private) values ($1, 'vip', 'text', true) returning id", [serverId])).id;
  await db.query("insert into public.messages (channel_id, server_id, author_id, content) values ($1, $2, $3, 'secret plans')", [vip, serverId, owner]);
}, 60_000);

const sees = async (user: string) => {
  await asUser(db, user);
  return (await rows(db, "select 1 from public.channels where id = $1", [vip])).length === 1;
};

describe("private channels", () => {
  it("are hidden, with their messages, from members who weren't let in", async () => {
    expect(await sees(owner)).toBe(true);
    expect(await sees(juan)).toBe(false);
    expect(await sees(mod)).toBe(false);
    await asUser(db, juan);
    expect(await rows(db, "select 1 from public.messages where channel_id = $1", [vip])).toHaveLength(0);
    expect(await failure(db, "insert into public.messages (channel_id, server_id, author_id, content) values ($1, $2, $3, 'hi')", [vip, serverId, juan])).toBeTruthy();
    expect((await one<{ ok: boolean }>(db, "select public.can_access_realtime_topic($1) as ok", [`db:chat:${vip}`])).ok).toBe(false);
  });

  it("lets admins grant a person, persistently, and only admins can", async () => {
    await asUser(db, mod);
    expect(await failure(db, "insert into public.channel_access (channel_id, server_id, user_id) values ($1, $2, $3)", [vip, serverId, juan])).toBeTruthy();
    // A moderator can't even see it, so they can't open it up either.
    await db.query("update public.channels set is_private = false where id = $1", [vip]);
    expect(await sees(juan)).toBe(false);

    await asUser(db, owner);
    await db.query("insert into public.channel_access (channel_id, server_id, user_id) values ($1, $2, $3)", [vip, serverId, juan]);
    expect(await sees(juan)).toBe(true);
    await asUser(db, juan);
    expect(await rows(db, "select content from public.messages where channel_id = $1", [vip])).toEqual([{ content: "secret plans" }]);
    await db.query("insert into public.messages (channel_id, server_id, author_id, content) values ($1, $2, $3, 'salamat')", [vip, serverId, juan]);
    expect((await one<{ ok: boolean }>(db, "select public.can_access_realtime_topic($1) as ok", [`db:chat:${vip}`])).ok).toBe(true);
    expect(await sees(maria)).toBe(false);
  });

  it("lets admins grant a role, and handing out the role lets its members in", async () => {
    await asUser(db, juan);
    expect(await failure(db, "insert into public.server_roles (server_id, name) values ($1, 'Hackers')", [serverId])).toBeTruthy();

    await asUser(db, owner);
    const { id: role } = await one<{ id: string }>(db, "insert into public.server_roles (server_id, name, color) values ($1, 'VIP', '#ffb800') returning id", [serverId]);
    expect(await failure(db, "insert into public.server_roles (server_id, name) values ($1, ' vip ')", [serverId])).toBeTruthy();
    await db.query("insert into public.channel_access (channel_id, server_id, role_id) values ($1, $2, $3)", [vip, serverId, role]);
    expect(await sees(maria)).toBe(false);
    await asUser(db, owner);
    await db.query("insert into public.member_roles (server_id, user_id, role_id) values ($1, $2, $3)", [serverId, maria, role]);
    expect(await sees(maria)).toBe(true);
    // Everyone sees who has which role.
    await asUser(db, juan);
    expect(await rows(db, "select user_id from public.member_roles where role_id = $1", [role])).toEqual([{ user_id: maria }]);
    // Deleting the role takes the access with it.
    await asUser(db, owner);
    await db.query("delete from public.server_roles where id = $1", [role]);
    expect(await sees(maria)).toBe(false);
  });

  it("keeps moderators from creating private channels", async () => {
    await asUser(db, mod);
    expect(await failure(db, "insert into public.channels (server_id, name, type, is_private) values ($1, 'secret', 'text', true)", [serverId])).toMatch(/ONLY_ADMINS_CHANGE_PRIVACY/);
  });
});
