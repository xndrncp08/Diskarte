// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asService, asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let ana: string;
let ben: string;
let cara: string; // server member, not a friend
let outsider: string;
let dm: string;
let serverId: string;
let voice: string;
let general: string;

const allowed = async (topic: string) => (await one<{ ok: boolean }>(db, "select public.can_access_realtime_topic($1) as ok", [topic])).ok;

beforeAll(async () => {
  db = await createDb();
  ana = await signUp(db, "ana@diskarte.ph", { username: "ana" });
  ben = await signUp(db, "ben@diskarte.ph", { username: "ben" });
  cara = await signUp(db, "cara@diskarte.ph", { username: "cara" });
  outsider = await signUp(db, "outsider@diskarte.ph", { username: "labas" });

  await asUser(db, ana);
  await db.query("select public.send_friend_request('ben')");
  await asUser(db, ben);
  await db.query("select public.respond_friend_request($1, true)", [ana]);
  await asUser(db, ana);
  dm = (await one<{ id: string }>(db, "select public.open_dm($1) id", [ben])).id;

  serverId = (await one<{ id: string }>(db, "select public.create_server('Barkada HQ') as id")).id;
  const code = (await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [serverId])).invite_code;
  await asUser(db, cara);
  await db.query("select public.join_server($1)", [code]);
  await asService(db);
  voice = (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and type = 'voice' order by position limit 1", [serverId])).id;
  general = (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and name = 'general'", [serverId])).id;
}, 60_000);

describe("call rings", () => {
  it("rings the other DM participant once, visible only to the two of them", async () => {
    await asUser(db, ana);
    const ids = await rows<{ ring_call: string }>(db, "select public.ring_call('dm', $1, null, true)", [dm]);
    expect(ids).toHaveLength(1);
    // Ringing again while it's still ringing doesn't stack a second pop-up.
    expect(await rows(db, "select public.ring_call('dm', $1)", [dm])).toHaveLength(0);

    await asUser(db, ben);
    const mine = await rows<{ caller_id: string; kind: string; video: boolean; status: string }>(db, "select caller_id, kind, video, status from public.call_rings");
    expect(mine).toEqual([{ caller_id: ana, kind: "dm", video: true, status: "ringing" }]);
    await asUser(db, outsider);
    expect(await rows(db, "select * from public.call_rings")).toHaveLength(0);
    expect(await failure(db, "select public.ring_call('dm', $1)", [dm])).toMatch(/NOT_A_PARTICIPANT/);
  });

  it("lets only the callee answer, once", async () => {
    await asService(db);
    const { id } = await one<{ id: string }>(db, "select id from public.call_rings where callee_id = $1", [ben]);
    await asUser(db, ana);
    expect(await failure(db, "select public.respond_ring($1, true)", [id])).toMatch(/RING_NOT_FOUND/);
    await asUser(db, ben);
    expect((await one<{ s: string }>(db, "select public.respond_ring($1, true) s", [id])).s).toBe("accepted");
    expect((await one<{ s: string }>(db, "select public.respond_ring($1, false) s", [id])).s).toBe("accepted");
  });

  it("marks rings that ran out as missed", async () => {
    await asUser(db, ana);
    const { ring_call: id } = await one<{ ring_call: string }>(db, "select public.ring_call('dm', $1)", [dm]);
    await asService(db);
    await db.query("update public.call_rings set expires_at = now() - interval '1 second' where id = $1", [id]);
    await asUser(db, ben);
    expect((await one<{ s: string }>(db, "select public.respond_ring($1, true) s", [id])).s).toBe("missed");
  });

  it("pings a fellow server member into a voice channel, but never outsiders or text channels", async () => {
    await asUser(db, ana);
    expect(await rows(db, "select public.ring_call('voice', $1, $2)", [voice, cara])).toHaveLength(1);
    expect(await failure(db, "select public.ring_call('voice', $1, $2)", [voice, outsider])).toMatch(/CANNOT_RING/);
    expect(await failure(db, "select public.ring_call('voice', $1, $2)", [general, cara])).toMatch(/NOT_A_VOICE_CHANNEL/);
    expect(await failure(db, "select public.ring_call('voice', $1, $2)", [voice, ana])).toMatch(/CANNOT_RING/);
    await asUser(db, outsider);
    expect(await failure(db, "select public.ring_call('voice', $1, $2)", [voice, cara])).toMatch(/CANNOT_RING/);
    await asUser(db, cara);
    const ring = await one<{ kind: string; server_id: string; channel_id: string }>(db, "select kind, server_id, channel_id from public.call_rings where caller_id = $1", [ana]);
    expect(ring).toEqual({ kind: "voice", server_id: serverId, channel_id: voice });
  });

  it("lets the caller cancel, and blocks stop rings", async () => {
    await asUser(db, ana);
    await db.query("select public.cancel_rings($1)", [voice]);
    await asUser(db, cara);
    expect((await one<{ status: string }>(db, "select status from public.call_rings where channel_id = $1", [voice])).status).toBe("cancelled");
    await db.query("select public.block_user($1)", [ana]);
    await asUser(db, ana);
    expect(await failure(db, "select public.ring_call('voice', $1, $2)", [voice, cara])).toMatch(/CANNOT_RING/);
  });

  it("can't be written directly, and each user only joins their own ring topic", async () => {
    await asUser(db, ana);
    expect(await failure(db, "insert into public.call_rings (kind, caller_id, callee_id, conversation_id) values ('dm', $1, $2, $3)", [ana, ben, dm])).toMatch(/permission denied|row-level security/);
    expect(await failure(db, "update public.call_rings set status = 'accepted'")).toMatch(/permission denied|row-level security/);
    expect(await allowed(`db:rings:${ana}`)).toBe(true);
    expect(await allowed(`db:rings:${ben}`)).toBe(false);
    await asAnon(db);
    expect(await failure(db, "select public.ring_call('dm', $1)", [dm])).toMatch(/permission denied/);
  });
});
