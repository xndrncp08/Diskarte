// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let owner: string;
let juan: string;
let outsider: string;
let serverId: string;
let general: string;
let voice: string;

const schedule = (channel: string, content: string, at = "now() + interval '1 hour'") =>
  one<{ id: string }>(db, `insert into public.scheduled_messages (channel_id, content, send_at) values ($1, $2, ${at}) returning id`, [channel, content]);
// Make a pending row due without breaking the "send_at in the future" insert rule.
const makeDue = (id: string) => asService(db).then(() => db.query("update public.scheduled_messages set send_at = now() - interval '1 second' where id = $1", [id]));

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
  voice = (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and type = 'voice' limit 1", [serverId])).id;
}, 60_000);

describe("scheduled messages", () => {
  it("only members schedule, only in text channels, only in the future, and only see their own", async () => {
    await asUser(db, juan);
    const { id } = await schedule(general, "Kain na!");
    expect(await failure(db, "insert into public.scheduled_messages (channel_id, content, send_at) values ($1, 'x', now() - interval '1 minute')", [general])).toBeTruthy();
    expect(await failure(db, "insert into public.scheduled_messages (channel_id, content, send_at) values ($1, 'x', now() + interval '40 days')", [general])).toBeTruthy();
    expect(await failure(db, "insert into public.scheduled_messages (channel_id, content, send_at) values ($1, 'x', now() + interval '1 hour')", [voice])).toBeTruthy();
    await asUser(db, outsider);
    expect(await failure(db, "insert into public.scheduled_messages (channel_id, content, send_at) values ($1, 'x', now() + interval '1 hour')", [general])).toBeTruthy();
    await asUser(db, owner);
    expect(await rows(db, "select 1 from public.scheduled_messages")).toHaveLength(0);
    expect(await failure(db, "update public.scheduled_messages set content = 'hijack' where id = $1", [id])).toBeTruthy();
    await asUser(db, juan);
    await db.query("delete from public.scheduled_messages where id = $1", [id]);
  });

  it("publishes due messages as the author; a signed-in caller only publishes their own", async () => {
    await asUser(db, juan);
    const mine = await schedule(general, "Scheduled hello");
    await asUser(db, owner);
    const theirs = await schedule(general, "Owner later");
    await makeDue(mine.id);
    await makeDue(theirs.id);

    await asUser(db, juan);
    expect(await one(db, "select public.publish_scheduled_messages() as n")).toEqual({ n: 1 });
    expect(await one(db, "select id, author_id, content from public.messages where id = $1", [mine.id])).toEqual({ id: mine.id, author_id: juan, content: "Scheduled hello" });
    expect(await rows(db, "select 1 from public.scheduled_messages")).toHaveLength(0);
    // The caller's identity is restored afterwards.
    expect(await one(db, "select auth.uid() as uid")).toEqual({ uid: juan });

    // The platform job (no signed-in user) publishes the rest.
    await asService(db);
    expect(await one(db, "select public.publish_scheduled_messages() as n")).toEqual({ n: 1 });
    expect(await one(db, "select author_id from public.messages where id = $1", [theirs.id])).toEqual({ author_id: owner });
  });

  it("keeps a message that can't be sent, with the reason, instead of bypassing the rules", async () => {
    await asUser(db, juan);
    const { id } = await schedule(general, "Bawal na ako");
    await asUser(db, owner);
    await db.query("select public.timeout_member($1, $2, 10)", [serverId, juan]);
    await makeDue(id);
    expect(await one(db, "select public.publish_scheduled_messages() as n")).toEqual({ n: 0 });
    await asUser(db, juan);
    expect((await one<{ failed_reason: string }>(db, "select failed_reason from public.scheduled_messages where id = $1", [id])).failed_reason).toMatch(/TIMED_OUT/);
    expect(await rows(db, "select 1 from public.messages where id = $1", [id])).toHaveLength(0);
  });

  it("caps pending messages per person", async () => {
    await asUser(db, owner);
    for (let i = 0; i < 25; i++) await schedule(general, `msg ${i}`);
    expect(await failure(db, "insert into public.scheduled_messages (channel_id, content, send_at) values ($1, 'one more', now() + interval '1 hour')", [general])).toMatch(/SCHEDULED_LIMIT/);
  });
});
