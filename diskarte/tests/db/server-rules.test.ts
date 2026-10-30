// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let owner: string;
let juan: string;
let mod: string;
let serverId: string;
let general: string;
let n = 0;

const send = (author: string) => db.query("insert into public.messages (channel_id, author_id, content) values ($1, $2, $3)", [general, author, `msg ${++n}`]);

beforeAll(async () => {
  db = await createDb();
  owner = await signUp(db, "owner@diskarte.ph", { username: "kapitan" });
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
  mod = await signUp(db, "mod@diskarte.ph", { username: "tanod" });
  await asUser(db, owner);
  serverId = (await one<{ id: string }>(db, "select public.create_server('Barkada', '') as id")).id;
  const { invite_code } = await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [serverId]);
  for (const u of [juan, mod]) {
    await asUser(db, u);
    await db.query("select public.join_server($1)", [invite_code]);
  }
  await asUser(db, owner);
  await db.query("update public.members set role = 'moderator' where server_id = $1 and user_id = $2", [serverId, mod]);
  general = (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and type = 'text' order by position limit 1", [serverId])).id;
}, 60_000);

describe("server rules", () => {
  it("block members from posting until they accept; moderators are exempt", async () => {
    await asUser(db, juan);
    await send(juan); // no rules yet
    await asUser(db, owner);
    await db.query("update public.servers set rules = '1. Be kind. 2. Walang scam.' where id = $1", [serverId]);
    expect((await one<{ rules_updated_at: string | null }>(db, "select rules_updated_at from public.servers where id = $1", [serverId])).rules_updated_at).not.toBeNull();
    await asUser(db, juan);
    expect(await failure(db, "insert into public.messages (channel_id, author_id, content) values ($1, $2, 'hello?')", [general, juan])).toMatch(/RULES_NOT_ACCEPTED/);
    await asUser(db, mod);
    await send(mod);
    await asUser(db, juan);
    await db.query("select public.accept_server_rules($1)", [serverId]);
    await send(juan);
  });

  it("asks again when the rules change", async () => {
    await asService(db);
    await db.query("update public.rules_acceptances set accepted_at = now() - interval '1 minute'");
    await asUser(db, owner);
    await db.query("update public.servers set rules = '1. Be kind. 2. Walang scam. 3. English or Filipino.' where id = $1", [serverId]);
    await asUser(db, juan);
    expect(await failure(db, "insert into public.messages (channel_id, author_id, content) values ($1, $2, 'ulit')", [general, juan])).toMatch(/RULES_NOT_ACCEPTED/);
  });

  it("acceptances are visible to the member and moderators, and only members can accept", async () => {
    const outsider = await signUp(db, "x@diskarte.ph", { username: "dayo" });
    await asUser(db, outsider);
    expect(await failure(db, "select public.accept_server_rules($1)", [serverId])).toMatch(/NOT_A_MEMBER/);
    expect(await rows(db, "select 1 from public.rules_acceptances")).toHaveLength(0);
    await asUser(db, mod);
    expect(await rows(db, "select user_id from public.rules_acceptances")).toEqual([{ user_id: juan }]);
    expect(await failure(db, "insert into public.rules_acceptances (server_id, user_id) values ($1, $2)", [serverId, mod])).toBeTruthy();
  });
});
