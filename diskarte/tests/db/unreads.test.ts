// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, one, rows, signUp, type Db } from "./harness";

let db: Db;
let owner: string;
let juan: string;
let maria: string;
let serverId: string;
let general: string;
let secret: string;

type Unread = { channel_id: string; last_message_at: string | null; read_at: string; mentions: number };
const unreads = async (user: string) => {
  await asUser(db, user);
  return rows<Unread>(db, "select * from public.my_unreads()");
};
const unreadFor = async (user: string, channel: string) => (await unreads(user)).find((u) => u.channel_id === channel);
const isUnread = (u: Unread | undefined) => !!u?.last_message_at && new Date(u.last_message_at) > new Date(u.read_at);
const post = async (user: string, channel: string, content: string) => {
  await asUser(db, user);
  await db.query("insert into public.messages (channel_id, server_id, author_id, content) values ($1, $2, $3, $4)", [channel, serverId, user, content]);
};

beforeAll(async () => {
  db = await createDb();
  owner = await signUp(db, "owner@diskarte.ph", { username: "kapitan" });
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
  maria = await signUp(db, "maria@diskarte.ph", { username: "maria.c" });
  await asUser(db, owner);
  serverId = (await one<{ id: string }>(db, "select public.create_server('Barkada', '') as id")).id;
  const { invite_code } = await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [serverId]);
  for (const u of [juan, maria]) {
    await asUser(db, u);
    await db.query("select public.join_server($1)", [invite_code]);
  }
  await asUser(db, owner);
  general = (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and type = 'text' order by position limit 1", [serverId])).id;
  secret = (await one<{ id: string }>(db, "insert into public.channels (server_id, name, type, is_private) values ($1, 'secret', 'text', true) returning id", [serverId])).id;
}, 60_000);

describe("unreads and mentions", () => {
  it("marks a channel unread for others when someone posts, and read once you open it", async () => {
    await post(owner, general, "kumain na kayo?");
    expect(isUnread(await unreadFor(juan, general))).toBe(true);
    await asUser(db, juan);
    await db.query("select public.mark_channel_read($1)", [general]);
    expect(isUnread(await unreadFor(juan, general))).toBe(false);
  });

  it("counts @mentions for the people named, @everyone only from moderators", async () => {
    await post(juan, general, "hi @maria.c and @Kapitan, also @nobody");
    expect((await unreadFor(maria, general))?.mentions).toBe(1);
    expect((await unreadFor(owner, general))?.mentions).toBe(1);
    expect((await unreadFor(juan, general))?.mentions).toBe(0);
    await post(juan, general, "@everyone free food"); // a member: plain text
    expect((await unreadFor(maria, general))?.mentions).toBe(1);
    await post(owner, general, "@everyone meeting na"); // the owner: pings everyone
    expect((await unreadFor(maria, general))?.mentions).toBe(2);
    await asUser(db, maria);
    await db.query("select public.mark_channel_read($1)", [general]);
    expect((await unreadFor(maria, general))?.mentions).toBe(0);
  });

  it("never reveals private channels, or mentions in them, to people without access", async () => {
    await post(owner, secret, "@juan psst");
    expect(await unreadFor(juan, secret)).toBeUndefined();
    await asUser(db, juan);
    expect(await rows(db, "select 1 from public.message_mentions where channel_id = $1", [secret])).toHaveLength(0);
    expect((await unreadFor(owner, secret))?.last_message_at).toBeTruthy();
  });

  it("lets you follow only your own mentions live", async () => {
    await asUser(db, juan);
    expect((await one<{ ok: boolean }>(db, "select public.can_access_realtime_topic($1) as ok", [`db:mentions:${juan}`])).ok).toBe(true);
    expect((await one<{ ok: boolean }>(db, "select public.can_access_realtime_topic($1) as ok", [`db:mentions:${maria}`])).ok).toBe(false);
  });

  it("keeps read points private and server-written", async () => {
    await asUser(db, maria);
    expect(await rows(db, "select 1 from public.channel_reads where user_id <> $1", [maria])).toHaveLength(0);
    await expect(db.query("insert into public.channel_reads (user_id, channel_id) values ($1, $2)", [juan, general])).rejects.toThrow();
  });
});
