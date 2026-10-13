// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let owner: string;
let juan: string;
let outsider: string;
let general: string;
let poll: string;

beforeAll(async () => {
  db = await createDb();
  owner = await signUp(db, "owner@diskarte.ph", { username: "kapitan" });
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
  outsider = await signUp(db, "out@diskarte.ph", { username: "outsider" });
  await asUser(db, owner);
  const serverId = (await one<{ id: string }>(db, "select public.create_server('Barkada', '') as id")).id;
  const { invite_code } = await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [serverId]);
  await asUser(db, juan);
  await db.query("select public.join_server($1)", [invite_code]);
  await asUser(db, owner);
  general = (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and type = 'text' order by position limit 1", [serverId])).id;
}, 60_000);

const votes = async () => rows<{ user_id: string; option: number }>(db, "select user_id, option from public.poll_votes where message_id = $1 order by user_id, option", [poll]);

describe("polls", () => {
  it("posts a poll as a message with its question, and validates it", async () => {
    await asUser(db, owner);
    poll = (await one<{ id: string }>(db, "select public.create_poll($1, 'Saan tayo kakain?', array['Jollibee', ' Mang Inasal ', ''], false, 24) as id", [general])).id;
    expect(await one(db, "select content, has_poll from public.messages where id = $1", [poll])).toEqual({ content: "Saan tayo kakain?", has_poll: true });
    expect(await one(db, "select options from public.polls where message_id = $1", [poll])).toEqual({ options: ["Jollibee", "Mang Inasal"] });
    expect(await failure(db, "select public.create_poll($1, 'Q', array['only one'], false, 24)", [general])).toMatch(/INVALID_POLL_OPTIONS/);
    expect(await failure(db, "select public.create_poll($1, 'Q', array['a','b'], false, 5)", [general])).toMatch(/INVALID_POLL_DURATION/);
    await asUser(db, outsider);
    expect(await failure(db, "select public.create_poll($1, 'Q', array['a','b'], false, 24)", [general])).toMatch(/CANNOT_POST/);
  });

  it("takes one answer per person (replacing earlier ones), and only from people who can see it", async () => {
    await asUser(db, juan);
    await db.query("select public.vote_poll($1, array[0]::smallint[])", [poll]);
    await db.query("select public.vote_poll($1, array[1]::smallint[])", [poll]);
    expect(await failure(db, "select public.vote_poll($1, array[0,1]::smallint[])", [poll])).toMatch(/INVALID_VOTE/);
    expect(await failure(db, "select public.vote_poll($1, array[7]::smallint[])", [poll])).toMatch(/INVALID_VOTE/);
    expect(await votes()).toEqual([{ user_id: juan, option: 1 }]);
    await asUser(db, outsider);
    expect(await failure(db, "select public.vote_poll($1, array[0]::smallint[])", [poll])).toMatch(/CANNOT_VOTE/);
    expect(await rows(db, "select 1 from public.poll_votes")).toHaveLength(0);
  });

  it("closes when time's up", async () => {
    // Clients can't edit polls (no update grant); age it as the service would.
    await asUser(db, owner);
    expect(await failure(db, "update public.polls set ends_at = now() where message_id = $1", [poll])).toBeTruthy();
    await asService(db);
    await db.query("update public.polls set ends_at = now() - interval '1 minute' where message_id = $1", [poll]);
    await asUser(db, juan);
    expect(await failure(db, "select public.vote_poll($1, array[0]::smallint[])", [poll])).toMatch(/POLL_CLOSED/);
  });
});
