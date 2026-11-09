// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let ana: string;
let ben: string;
let cara: string; // ana's friend, not ben's
let dan: string; // nobody's friend
let serverId: string;
let voice: string;

async function befriend(a: string, b: string) {
  await asService(db);
  await db.query("insert into public.friendships (user_low, user_high, requested_by, status) values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid), $1, 'accepted')", [a, b]);
}

async function beat(user: string, opts: { status?: string; voice?: string | null } = {}) {
  await asUser(db, user);
  await db.query("select public.heartbeat_device(gen_random_uuid(), '0123456789abcdef', 'test', $1::public.presence_status, null, $2::uuid)", [opts.status ?? "online", opts.voice ?? null]);
}

beforeAll(async () => {
  db = await createDb();
  ana = await signUp(db, "ana@diskarte.ph", { username: "ana" });
  ben = await signUp(db, "ben@diskarte.ph", { username: "ben" });
  cara = await signUp(db, "cara@diskarte.ph", { username: "cara" });
  dan = await signUp(db, "dan@diskarte.ph", { username: "dan" });
  await befriend(ana, ben);
  await befriend(ana, cara);
  await asUser(db, ana);
  serverId = (await one<{ id: string }>(db, "select public.create_server('Kanto') as id")).id;
  await asService(db);
  voice = (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and type = 'voice' order by position limit 1", [serverId])).id;
}, 60_000);

describe("hangouts", () => {
  let hangout: string;

  it("starts with a single friend and is only visible to its participants", async () => {
    await asUser(db, ana);
    hangout = (await one<{ id: string }>(db, "select public.create_hangout($1, 'Laro tayo', 'gaming', 2) as id", [[ben]])).id;
    const row = await one<{ kind: string; hangout_topic: string; left: number }>(db, "select kind, hangout_topic, round(extract(epoch from hangout_until - now()) / 3600)::int as left from public.dm_conversations where id = $1", [hangout]);
    expect(row).toEqual({ kind: "group", hangout_topic: "gaming", left: 2 });
    await asUser(db, ben);
    expect(await rows(db, "select id from public.dm_conversations")).toEqual([{ id: hangout }]);
    await asUser(db, dan);
    expect(await rows(db, "select id from public.dm_conversations")).toHaveLength(0);
  });

  it("follows the friends and size rules", async () => {
    await asUser(db, ana);
    expect(await failure(db, "select public.create_hangout($1)", [[dan]])).toMatch(/DM_NOT_ALLOWED/);
    expect(await failure(db, "select public.create_hangout($1)", [[]])).toMatch(/INVALID_GROUP_SIZE/);
    expect(await failure(db, "select public.create_hangout($1, null, 'hangout', 48)", [[ben]])).toMatch(/INVALID_HANGOUT/);
    await asUser(db, ben);
    expect(await failure(db, "select public.create_hangout($1)", [[cara]])).toMatch(/DM_NOT_ALLOWED/);
  });

  it("caps how many live hangouts one person hosts", async () => {
    await asUser(db, ana);
    await db.query("select public.create_hangout($1)", [[cara]]);
    await db.query("select public.create_hangout($1)", [[ben, cara]]);
    expect(await failure(db, "select public.create_hangout($1)", [[ben]])).toMatch(/RATE_LIMITED/);
  });

  it("refuses file attachments while temporary", async () => {
    await asUser(db, ben);
    expect(await one(db, "select public.can_upload_dm_attachment($1) as ok", [hangout])).toEqual({ ok: false });
  });

  it("lets participants extend it, capped at 24 hours, and only the host keep or end it", async () => {
    await asUser(db, ben);
    await db.query("select public.extend_hangout($1, 6)", [hangout]);
    await db.query("select public.extend_hangout($1, 6)", [hangout]);
    await db.query("select public.extend_hangout($1, 6)", [hangout]);
    await db.query("select public.extend_hangout($1, 6)", [hangout]);
    const { left } = await one<{ left: number }>(db, "select round(extract(epoch from hangout_until - now()) / 3600)::int as left from public.dm_conversations where id = $1", [hangout]);
    expect(left).toBe(24);
    expect(await failure(db, "select public.extend_hangout($1, 1, true)", [hangout])).toMatch(/NOT_HANGOUT_HOST/);
    expect(await failure(db, "select public.end_hangout($1)", [hangout])).toMatch(/NOT_HANGOUT_HOST/);
    await asUser(db, dan);
    expect(await failure(db, "select public.extend_hangout($1)", [hangout])).toMatch(/HANGOUT_NOT_FOUND/);
  });

  it("stops new messages once the time is up and is purged with its messages", async () => {
    await asUser(db, ben);
    await db.query("insert into public.direct_messages (conversation_id, content) values ($1, 'tara')", [hangout]);
    await asService(db);
    await db.query("update public.dm_conversations set hangout_until = now() - interval '1 second' where id = $1", [hangout]);
    await asUser(db, ben);
    expect(await failure(db, "insert into public.direct_messages (conversation_id, content) values ($1, 'late')", [hangout])).toMatch(/HANGOUT_ENDED/);
    await asService(db);
    expect(await one(db, "select public.purge_expired_hangouts() as n")).toEqual({ n: 1 });
    expect(await rows(db, "select 1 from public.direct_messages where conversation_id = $1", [hangout])).toHaveLength(0);
    await asUser(db, ana);
    expect(await failure(db, "select public.purge_expired_hangouts()")).toMatch(/permission denied/);
  });

  it("keeps a hangout for good as a normal group conversation", async () => {
    await asUser(db, ana);
    const { id } = await one<{ id: string }>(db, "select id from public.dm_conversations where hangout_until is not null limit 1");
    await db.query("select public.extend_hangout($1, 1, true)", [id]);
    expect(await one(db, "select hangout_until from public.dm_conversations where id = $1", [id])).toEqual({ hangout_until: null });
    await db.query("select public.end_hangout($1)", [(await one<{ id: string }>(db, "select id from public.dm_conversations where hangout_until is not null limit 1")).id]);
    expect(await failure(db, "select public.end_hangout($1)", [id])).toMatch(/NOT_HANGOUT_HOST/);
  });
});

describe("friends activity", () => {
  it("shows online friends, hides invisible ones, strangers and opted-out friends", async () => {
    await beat(ben);
    await beat(cara, { status: "invisible" });
    await beat(dan);
    await asUser(db, ana);
    expect(await rows(db, "select user_id, status from public.friends_activity()")).toEqual([{ user_id: ben, status: "online" }].map((r) => ({ ...r })));

    await asUser(db, ben);
    await db.query("insert into public.privacy_settings (share_activity) values (false)");
    await asUser(db, ana);
    expect(await rows(db, "select user_id from public.friends_activity()")).toHaveLength(0);
    await asUser(db, ben);
    await db.query("update public.privacy_settings set share_activity = true");
  });

  it("reveals a voice channel only to someone who can see it", async () => {
    await asService(db);
    await db.query("insert into public.members (server_id, user_id) values ($1, $2)", [serverId, cara]);
    await beat(cara, { voice });
    await asUser(db, ana);
    const seen = await rows<{ user_id: string; voice_channel_id: string | null; voice_server_id: string | null }>(db, "select user_id, voice_channel_id, voice_server_id from public.friends_activity() where user_id = $1", [cara]);
    expect(seen).toEqual([{ user_id: cara, voice_channel_id: voice, voice_server_id: serverId }]);

    // ben is ana's friend but not in Kanto: cara's call there stays private from him.
    await befriend(ben, cara);
    await asUser(db, ben);
    expect(await rows(db, "select voice_channel_id from public.friends_activity() where user_id = $1", [cara])).toEqual([{ voice_channel_id: null }]);
  });
});
