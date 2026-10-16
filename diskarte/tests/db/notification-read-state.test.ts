// @vitest-environment node
import { createECDH, randomBytes, randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asService, asUser, createDb, one, rows, signUp, type Db } from "./harness";

/**
 * Regression: notifications came back after being read. Push jobs are queued and retried, and the
 * worker never checked read state, so a DM or mention already read in the app was pushed later.
 */
let db: Db;
let alice: string;
let bob: string;
let server: string;
let channel: string;
let conversation: string;
const device = randomUUID();
const key = createECDH("prime256v1");
key.generateKeys();
const publicKey = key.getPublicKey().toString("base64url");
const auth = randomBytes(16).toString("base64url");

async function bobSession() {
  await asService(db);
  const id = (await one<{ id: string }>(db, "insert into auth.sessions(user_id) values($1) returning id", [bob])).id;
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ session_id: id })]);
  await asUser(db, bob);
}
const claim = async () => {
  await asService(db);
  return rows<{ id: string; lease: string }>(db, "select * from public.claim_push_jobs(50)");
};
const prepare = async (job: { id: string; lease: string }) => {
  await asService(db);
  return (await one<{ job: Record<string, unknown> | null }>(db, "select public.prepare_push_job($1,$2) as job", [job.id, job.lease])).job;
};
const sendDm = async (content: string) => {
  await asUser(db, alice);
  return (await one<{ id: string }>(db, "insert into public.direct_messages(conversation_id,author_id,content) values($1,$2,$3) returning id", [conversation, alice, content])).id;
};
const mention = async (extra: { thread?: string } = {}) => {
  await asUser(db, alice);
  return (
    await one<{ id: string }>(db, "insert into public.messages(channel_id,author_id,content,thread_id) values($1,$2,'@read_bob look',$3) returning id", [channel, alice, extra.thread ?? null])
  ).id;
};

beforeAll(async () => {
  db = await createDb();
  alice = await signUp(db, "read-alice@example.test", { username: "read_alice" });
  bob = await signUp(db, "read-bob@example.test", { username: "read_bob" });
  await asUser(db, alice);
  server = (await one<{ id: string }>(db, "select public.create_server('Read state','') as id")).id;
  channel = (await one<{ id: string }>(db, "select id from public.channels where server_id=$1 and type='text' limit 1", [server])).id;
  await asService(db);
  await db.query("insert into public.members(server_id,user_id) values($1,$2)", [server, bob]);
  await db.query("insert into public.friendships(user_low,user_high,requested_by,status) values(least($1::uuid,$2::uuid),greatest($1::uuid,$2::uuid),$1,'accepted')", [alice, bob]);
  await asUser(db, alice);
  conversation = (await one<{ id: string }>(db, "select public.open_dm($1) as id", [bob])).id;
  await asService(db);
  await db.exec("update private_push.configuration set enabled=true");
}, 60_000);

beforeEach(async () => {
  await asService(db);
  await db.exec("delete from private_push.outbox; delete from private_push.subscriptions");
  await db.query("update public.dm_participants set last_read_at = now() - interval '1 hour' where user_id = $1", [bob]);
  await db.query("delete from public.channel_reads where user_id = $1", [bob]);
  await bobSession();
  await db.query("select public.register_push($1,$2,$3,$4,'Test browser')", [device, `https://fcm.googleapis.com/fcm/send/${device}`, publicKey, auth]);
});

describe("push after read", () => {
  it("doesn't push a DM that was read before the job ran", async () => {
    await sendDm("Kumusta?");
    await asUser(db, bob);
    await db.query("select public.mark_dm_read($1)", [conversation]);
    const [job] = await claim();
    expect(await prepare(job)).toBeNull();
  });

  it("doesn't push a retry once the DM has been read in between", async () => {
    await sendDm("Nandiyan ka?");
    const [job] = await claim();
    expect(await prepare(job)).toMatchObject({ kind: "dm" });
    await db.query("select public.finish_push_job($1,$2,'retry',503,'provider_unavailable',1)", [job.id, job.lease]);
    await asUser(db, bob);
    await db.query("select public.mark_dm_read_until($1, now())", [conversation]);
    await asService(db);
    await db.exec("update private_push.deliveries set next_attempt_at = now() - interval '1 second'");
    const [retry] = await claim();
    expect(await prepare(retry)).toBeNull();
  });

  it("still pushes a DM newer than what was read", async () => {
    await asUser(db, bob);
    await db.query("select public.mark_dm_read_until($1, now() - interval '1 minute')", [conversation]);
    await sendDm("Bagong mensahe");
    const [job] = await claim();
    expect(await prepare(job)).toMatchObject({ kind: "dm", body: "Bagong mensahe" });
  });

  it("doesn't push a mention in a channel already read, but does for thread replies", async () => {
    const root = await mention();
    await asUser(db, bob);
    await db.query("select public.mark_channel_read_until($1, now())", [channel]);
    let [job] = await claim();
    expect(await prepare(job)).toBeNull();
    await asService(db);
    await db.exec("delete from private_push.outbox");
    await mention({ thread: root });
    [job] = await claim();
    expect(await prepare(job)).toMatchObject({ kind: "mention" });
  });
});

describe("read receipts up to a moment", () => {
  it("caps a future timestamp at server time and never moves the cursor back", async () => {
    await asUser(db, bob);
    await db.query("select public.mark_channel_read_until($1, now() + interval '1 day')", [channel]);
    const { ahead } = await one<{ ahead: boolean }>(db, "select last_read_at > now() as ahead from public.channel_reads where channel_id = $1", [channel]);
    expect(ahead).toBe(false);
    const before = (await one<{ t: string }>(db, "select last_read_at::text as t from public.channel_reads where channel_id = $1", [channel])).t;
    await db.query("select public.mark_channel_read_until($1, now() - interval '1 day')", [channel]);
    expect((await one<{ t: string }>(db, "select last_read_at::text as t from public.channel_reads where channel_id = $1", [channel])).t).toBe(before);
  });
});
