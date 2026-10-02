// @vitest-environment node
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asService, asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let owner: string;
let mod: string;
let member: string;
let unverified: string;
let outsider: string;
let serverId: string;
let inviteCode: string;
let general: string;
let chika: string;
let voice: string;

async function channelId(name: string) {
  await asService(db);
  return (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and name = $2", [serverId, name])).id;
}

/** Inserts a message as `userId`; resolves to the new id, or null when auto-mod dropped it. */
async function send(userId: string, content: string, extra: { channel?: string; thread?: string; sticker?: string; reply?: string } = {}) {
  await asUser(db, userId);
  const result = await rows<{ id: string }>(
    db,
    "insert into public.messages (channel_id, author_id, content, thread_id, sticker, reply_to_id) values ($1, $2, $3, $4, $5, $6) returning id",
    [extra.channel ?? general, userId, content, extra.thread ?? null, extra.sticker ?? null, extra.reply ?? null],
  );
  return result[0]?.id ?? null;
}

/** Push everyone's messages into the past so rate limits / slow mode don't interfere between tests. */
async function ageMessages() {
  await asService(db);
  await db.query("update public.messages set created_at = created_at - interval '1 day'");
  await db.query("update public.direct_messages set created_at = created_at - interval '1 day'");
}

async function audit(action: string) {
  await asService(db);
  return rows<{ actor_id: string; target_id: string; metadata: Record<string, unknown> }>(
    db,
    "select actor_id, target_id, metadata from public.audit_logs where server_id = $1 and action = $2 order by id",
    [serverId, action],
  );
}

async function join(userId: string) {
  await asUser(db, userId);
  await db.query("select public.join_server($1)", [inviteCode]);
}

beforeAll(async () => {
  db = await createDb();
  owner = await signUp(db, "owner@diskarte.ph", { username: "kapitan" });
  mod = await signUp(db, "mod@diskarte.ph", { username: "bantay" });
  member = await signUp(db, "member@diskarte.ph", { username: "juan" });
  unverified = await signUp(db, "new@diskarte.ph", { username: "bagito" }, { verified: false });
  outsider = await signUp(db, "outsider@diskarte.ph", { username: "dayo" });

  await asUser(db, owner);
  serverId = (await one<{ id: string }>(db, "select public.create_server('Barkada HQ') as id")).id;
  inviteCode = (await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [serverId])).invite_code;
  for (const uid of [mod, member, unverified]) await join(uid);
  await asUser(db, owner);
  await db.query("update public.members set role = 'moderator' where server_id = $1 and user_id = $2", [serverId, mod]);

  general = await channelId("general");
  chika = await channelId("chika");
  voice = await channelId("Tambayan 1");
}, 60_000);

describe("message fixes", () => {
  it("lets authors delete a message that others replied to", async () => {
    const root = (await send(owner, "tanong lang"))!;
    await send(member, "sagot", { reply: root });
    await asUser(db, owner);
    expect(await failure(db, "delete from public.messages where id = $1", [root])).toBeNull();
    await asService(db);
    expect((await one<{ reply_to_id: string | null }>(db, "select reply_to_id from public.messages where content = 'sagot'")).reply_to_id).toBeNull();
    await ageMessages();
  });
});

describe("audit log", () => {
  it("records joins and role changes, but not the owner's own bootstrap", async () => {
    const joins = await audit("member.join");
    expect(joins.map((j) => j.target_id).sort()).toEqual([mod, member, unverified].sort());
    const roles = await audit("member.role_update");
    expect(roles).toHaveLength(1);
    expect(roles[0]).toMatchObject({ actor_id: owner, target_id: mod, metadata: { from: "member", to: "moderator" } });
    expect(await audit("channel.create")).toHaveLength(0); // default channels come from the bootstrap
  });

  it("records channel creation, updates and deletion", async () => {
    await asUser(db, mod);
    const id = (await one<{ id: string }>(db, "insert into public.channels (server_id, name) values ($1, 'memes') returning id", [serverId])).id;
    await db.query("update public.channels set slowmode_seconds = 30 where id = $1", [id]);
    await db.query("delete from public.channels where id = $1", [id]);
    expect((await audit("channel.create"))[0]).toMatchObject({ actor_id: mod, target_id: id, metadata: { name: "memes" } });
    expect((await audit("channel.update"))[0].metadata).toMatchObject({ changed: ["slowmode_seconds"], slowmode_seconds: 30 });
    expect(await audit("channel.delete")).toHaveLength(1);
  });

  it("records moderator deletions with an excerpt, but not authors deleting their own messages", async () => {
    const mine = (await send(member, "oops typo"))!;
    const theirs = (await send(member, "spoiler: namatay si ano"))!;
    await asUser(db, member);
    await db.query("delete from public.messages where id = $1", [mine]);
    await asUser(db, mod);
    await db.query("delete from public.messages where id = $1", [theirs]);
    const deletes = await audit("message.delete");
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toMatchObject({ actor_id: mod, target_id: theirs, metadata: { author_id: member, excerpt: "spoiler: namatay si ano" } });
    await ageMessages();
  });

  it("records pins and server setting changes", async () => {
    const id = (await send(member, "rules: be nice"))!;
    await asUser(db, mod);
    await db.query("update public.messages set pinned = true where id = $1", [id]);
    await asUser(db, owner);
    await db.query("update public.servers set automod_custom_terms = array['  Bawal  '] where id = $1", [serverId]);
    expect(await audit("message.pin")).toHaveLength(1);
    expect((await audit("server.update")).at(-1)!.metadata).toEqual({ changed: ["automod"] });
    await asService(db);
    expect((await one<{ t: string[] }>(db, "select automod_custom_terms t from public.servers where id = $1", [serverId])).t).toEqual(["bawal"]);
    await ageMessages();
  });

  it("is readable by moderators only and cannot be written or forged by clients", async () => {
    await asUser(db, member);
    expect(await rows(db, "select * from public.audit_logs")).toHaveLength(0);
    expect(await failure(db, "insert into public.audit_logs (server_id, action) values ($1, 'member.join')", [serverId])).toMatch(/permission denied/);
    expect(await failure(db, "select public.log_audit($1, 'server.update')", [serverId])).toMatch(/permission denied/);
    await asUser(db, mod);
    expect((await rows(db, "select * from public.audit_logs")).length).toBeGreaterThan(3);
    expect(await failure(db, "delete from public.audit_logs")).toMatch(/permission denied/);
  });
});

describe("bans", () => {
  it("lets moderators ban members: removed, logged once, and unable to rejoin", async () => {
    const troll = await signUp(db, "troll@diskarte.ph", { username: "troll" });
    await join(troll);
    await asUser(db, mod);
    await db.query("select public.ban_member($1, $2, 'spam links')", [serverId, troll]);
    await asService(db);
    expect(await rows(db, "select 1 from public.members where server_id = $1 and user_id = $2", [serverId, troll])).toHaveLength(0);
    expect((await audit("member.ban"))[0]).toMatchObject({ actor_id: mod, target_id: troll, metadata: { reason: "spam links" } });
    expect((await audit("member.kick")).filter((k) => k.target_id === troll)).toHaveLength(0);

    await asUser(db, troll);
    expect(await failure(db, "select public.join_server($1)", [inviteCode])).toMatch(/BANNED/);

    await asUser(db, mod);
    await db.query("select public.unban_member($1, $2)", [serverId, troll]);
    await asUser(db, troll);
    expect(await failure(db, "select public.join_server($1)", [inviteCode])).toBeNull();
    expect(await audit("member.unban")).toHaveLength(1);
  });

  it("respects the role hierarchy", async () => {
    await asUser(db, member);
    expect(await failure(db, "select public.ban_member($1, $2)", [serverId, unverified])).toMatch(/CANNOT_BAN_MEMBER/);
    await asUser(db, mod);
    expect(await failure(db, "select public.ban_member($1, $2)", [serverId, owner])).toMatch(/CANNOT_BAN_MEMBER/);
    expect(await failure(db, "select public.ban_member($1, $2)", [serverId, mod])).toMatch(/CANNOT_BAN_MEMBER/);
    await asUser(db, member);
    expect(await rows(db, "select * from public.server_bans")).toHaveLength(0);
    expect(await failure(db, "insert into public.server_bans (server_id, user_id) values ($1, $2)", [serverId, owner])).toMatch(/permission denied/);
  });
});

describe("auto-mod", () => {
  it("drops phishing links and logs the block for moderators", async () => {
    expect(await send(member, "libreng load! https://gcash-rewards.xyz/claim")).toBeNull();
    const blocks = await audit("automod.block");
    expect(blocks.at(-1)!.metadata).toMatchObject({ category: "phishing", author_id: member, channel_id: general });
    expect(await send(member, "legit: https://www.gcash.com/help")).not.toBeNull();
    await ageMessages();
  });

  it("uses the server's custom terms and categories, and skips moderators", async () => {
    expect(await send(member, "BAWAL dito ang ganyan")).toBeNull();
    expect(await send(mod, "bawal ang spam ha")).not.toBeNull();
    expect(await send(member, "check pornhub")).not.toBeNull(); // explicit is opt-in
    await asUser(db, owner);
    await db.query("update public.servers set automod_categories = array['explicit', 'hate', 'phishing', 'spam'] where id = $1", [serverId]);
    expect(await send(member, "check p0rnhub")).toBeNull();
    await asUser(db, owner);
    await db.query("update public.servers set automod_enabled = false where id = $1", [serverId]);
    expect(await send(member, "https://dlscord.gift/free")).not.toBeNull();
    await asUser(db, owner);
    await db.query("update public.servers set automod_enabled = true where id = $1", [serverId]);
    await ageMessages();
  });

  it("catches floods of the same message and re-checks edits", async () => {
    expect(await send(member, "G na G")).not.toBeNull();
    expect(await send(member, "G na G")).not.toBeNull();
    expect(await send(member, "G na G")).toBeNull();
    const id = (await send(member, "okay lang"))!;
    await asUser(db, member);
    expect(await failure(db, "update public.messages set content = 'https://discord-nitro.xyz' where id = $1", [id])).toMatch(/AUTOMOD_BLOCKED/);
    await ageMessages();
  });
});

describe("slow mode and verification gates", () => {
  it("enforces slow mode per channel for non-moderators, reporting the wait", async () => {
    await asUser(db, mod);
    await db.query("update public.channels set slowmode_seconds = 60 where id = $1", [chika]);
    expect(await send(member, "una", { channel: chika })).not.toBeNull();
    await asUser(db, member);
    let detail: string | undefined;
    try {
      await db.query("insert into public.messages (channel_id, author_id, content) values ($1, $2, 'pangalawa')", [chika, member]);
    } catch (err) {
      expect(String(err)).toMatch(/SLOWMODE/);
      detail = (err as { detail?: string }).detail;
    }
    expect(Number(detail)).toBeGreaterThan(0);
    expect(Number(detail)).toBeLessThanOrEqual(60);
    expect(await send(member, "sa ibang channel ok", { channel: general })).not.toBeNull();
    expect(await send(mod, "mods are exempt", { channel: chika })).not.toBeNull();
    expect(await send(mod, "twice", { channel: chika })).not.toBeNull();
    await asUser(db, mod);
    await db.query("update public.channels set slowmode_seconds = 0 where id = $1", [chika]);
    await ageMessages();
  });

  it("rejects out-of-range slow mode values", async () => {
    await asUser(db, mod);
    expect(await failure(db, "update public.channels set slowmode_seconds = 999999 where id = $1", [chika])).toMatch(/check/);
  });

  it("requires a verified email or phone in gated channels", async () => {
    await asUser(db, mod);
    await db.query("update public.channels set requires_verification = true where id = $1", [general]);
    await asUser(db, unverified);
    expect(await failure(db, "insert into public.messages (channel_id, author_id, content) values ($1, $2, 'hi')", [general, unverified])).toMatch(/VERIFICATION_REQUIRED/);
    expect((await one<{ v: boolean }>(db, "select public.is_verified_user() v")).v).toBe(false);
    expect(await send(unverified, "ok dito", { channel: chika })).not.toBeNull();
    expect(await send(member, "verified ako", { channel: general })).not.toBeNull();

    await asService(db);
    await db.query("update auth.users set phone_confirmed_at = now() where id = $1", [unverified]);
    expect(await send(unverified, "verified na via phone", { channel: general })).not.toBeNull();
    await asUser(db, mod);
    await db.query("update public.channels set requires_verification = false where id = $1", [general]);
    await ageMessages();
  });
});

describe("threads and stickers", () => {
  it("keeps reply counts on the root and validates thread targets", async () => {
    const root = (await send(owner, "Thread: best lugaw sa QC?"))!;
    await send(member, "Sa Cubao!", { thread: root });
    await send(mod, "Goto King", { thread: root });
    await asService(db);
    const counts = await one<{ thread_reply_count: number; thread_last_reply_at: string | null }>(
      db, "select thread_reply_count, thread_last_reply_at from public.messages where id = $1", [root]);
    expect(counts.thread_reply_count).toBe(2);
    expect(counts.thread_last_reply_at).not.toBeNull();

    const reply = (await one<{ id: string }>(db, "select id from public.messages where thread_id = $1 limit 1", [root])).id;
    await asUser(db, member);
    expect(await failure(db, "insert into public.messages (channel_id, author_id, content, thread_id) values ($1, $2, 'nested', $3)", [general, member, reply])).toMatch(/INVALID_THREAD/);
    expect(await failure(db, "insert into public.messages (channel_id, author_id, content, thread_id) values ($1, $2, 'wrong channel', $3)", [chika, member, root])).toMatch(/INVALID_THREAD/);
    expect(await failure(db, "update public.messages set thread_reply_count = 99 where id = $1", [reply])).toMatch(/MESSAGE_IMMUTABLE_FIELD/);

    await asUser(db, member);
    await db.query("delete from public.messages where thread_id = $1 and author_id = $2", [root, member]);
    await asService(db);
    expect((await one<{ c: number }>(db, "select thread_reply_count c from public.messages where id = $1", [root])).c).toBe(1);

    await asUser(db, owner);
    await db.query("delete from public.messages where id = $1", [root]);
    await asService(db);
    expect(await rows(db, "select 1 from public.messages where thread_id = $1", [root])).toHaveLength(0);
    await ageMessages();
  });

  it("allows sticker-only messages but not changing the sticker later", async () => {
    const id = (await send(member, "", { sticker: "sana-all" }))!;
    expect(id).not.toBeNull();
    await asUser(db, member);
    expect(await failure(db, "update public.messages set sticker = 'charot' where id = $1", [id])).toMatch(/MESSAGE_IMMUTABLE_FIELD/);
    expect(await failure(db, "insert into public.messages (channel_id, author_id, content, sticker) values ($1, $2, '', 'Bad Sticker!')", [general, member])).toMatch(/check/);
    expect(await failure(db, "insert into public.messages (channel_id, author_id, content) values ($1, $2, '')", [general, member])).toMatch(/messages_not_empty/);
    await ageMessages();
  });
});

describe("support badges", () => {
  it("lets admins grant badges that every member can see", async () => {
    await asUser(db, member);
    expect(await failure(db, "insert into public.server_badges (server_id, user_id, badge) values ($1, $2, 'booster')", [serverId, member])).toMatch(/row-level security/);
    await asUser(db, owner);
    await db.query("insert into public.server_badges (server_id, user_id, badge) values ($1, $2, 'booster'), ($1, $2, 'gcash_contributor')", [serverId, member]);
    expect(await failure(db, "insert into public.server_badges (server_id, user_id, badge) values ($1, $2, 'vip')", [serverId, member])).toMatch(/check/);
    expect(await failure(db, "insert into public.server_badges (server_id, user_id, badge) values ($1, $2, 'booster')", [serverId, outsider])).toMatch(/foreign key/);
    await asUser(db, unverified);
    const badges = await rows<{ badge: string; granted_by: string }>(db, "select badge, granted_by from public.server_badges where user_id = $1 order by badge", [member]);
    expect(badges).toEqual([{ badge: "booster", granted_by: owner }, { badge: "gcash_contributor", granted_by: owner }]);
    await asUser(db, outsider);
    expect(await rows(db, "select * from public.server_badges")).toHaveLength(0);
    expect(await audit("badge.grant")).toHaveLength(2);
  });

  it("lets admins set GCash / Maya details but validates the numbers", async () => {
    await asUser(db, owner);
    await db.query("update public.servers set gcash_number = '09171234567', support_note = ' Salamat sa suporta! ' where id = $1", [serverId]);
    expect(await failure(db, "update public.servers set maya_number = '12345' where id = $1", [serverId])).toMatch(/check/);
    await asUser(db, member);
    await db.query("update public.servers set gcash_number = '09999999999' where id = $1", [serverId]);
    const s = await one<{ gcash_number: string; support_note: string }>(db, "select gcash_number, support_note from public.servers where id = $1", [serverId]);
    expect(s).toEqual({ gcash_number: "09171234567", support_note: "Salamat sa suporta!" });
  });
});

describe("LFG beacons", () => {
  let beacon: string;

  it("creates a beacon with the author already in the party", async () => {
    await asUser(db, member);
    beacon = (await one<{ id: string }>(db, "select public.create_lfg($1, 'Valorant', 'Need 1 more, chill lang', 3, $2, 60) as id", [serverId, voice])).id;
    const party = await rows<{ user_id: string }>(db, "select user_id from public.lfg_party_members where beacon_id = $1", [beacon]);
    expect(party.map((p) => p.user_id)).toEqual([member]);
    expect(await failure(db, "select public.create_lfg($1, 'Dota', '', 5, $2)", [serverId, general])).toMatch(/INVALID_VOICE_CHANNEL/);
    expect(await failure(db, "insert into public.lfg_beacons (server_id, author_id, game, party_size, expires_at) values ($1, $2, 'x', 2, now())", [serverId, member])).toMatch(/permission denied/);
  });

  it("joins in one click, returns the voice channel and fills up", async () => {
    await asUser(db, mod);
    expect((await one<{ v: string }>(db, "select public.join_lfg($1) v", [beacon])).v).toBe(voice);
    await asUser(db, owner);
    await db.query("select public.join_lfg($1)", [beacon]);
    await asService(db);
    expect((await one<{ status: string }>(db, "select status from public.lfg_beacons where id = $1", [beacon])).status).toBe("full");
    await asUser(db, unverified);
    expect(await failure(db, "select public.join_lfg($1)", [beacon])).toMatch(/LFG_FULL/);
    await asUser(db, owner);
    await db.query("select public.leave_lfg($1)", [beacon]);
    await asUser(db, unverified);
    expect(await failure(db, "select public.join_lfg($1)", [beacon])).toBeNull();
  });

  it("hides beacons from outsiders and closes them when the author leaves", async () => {
    await asUser(db, outsider);
    expect(await rows(db, "select * from public.lfg_beacons")).toHaveLength(0);
    expect(await failure(db, "select public.join_lfg($1)", [beacon])).toMatch(/LFG_NOT_FOUND/);
    await asUser(db, mod);
    await db.query("select public.close_lfg($1)", [beacon]);
    await asUser(db, owner);
    expect(await failure(db, "select public.join_lfg($1)", [beacon])).toMatch(/LFG_CLOSED/);
    expect((await audit("lfg.close"))).toHaveLength(1);

    await asUser(db, unverified);
    const mine = (await one<{ id: string }>(db, "select public.create_lfg($1, 'ML', '', 5) as id", [serverId])).id;
    await db.query("delete from public.members where server_id = $1 and user_id = $2", [serverId, unverified]);
    await asService(db);
    expect((await one<{ status: string }>(db, "select status from public.lfg_beacons where id = $1", [mine])).status).toBe("closed");
    expect(await rows(db, "select 1 from public.lfg_party_members where user_id = $1", [unverified])).toHaveLength(0);
    expect((await audit("member.leave")).map((l) => l.target_id)).toContain(unverified);
    await join(unverified);
  });
});

describe("soundboard", () => {
  it("lets admins add clips stored under the server folder, up to 24", async () => {
    const path = `${serverId}/${randomUUID()}.mp3`;
    await asUser(db, mod);
    expect(await failure(db, "insert into public.soundboard_clips (server_id, name, storage_path) values ($1, 'Awit', $2)", [serverId, path])).toMatch(/row-level security/);
    expect(await failure(db, "insert into storage.objects (bucket_id, name) values ('soundboard', $1)", [path])).toMatch(/row-level security/);
    await asUser(db, owner);
    await db.query("insert into storage.objects (bucket_id, name) values ('soundboard', $1)", [path]);
    await db.query("insert into public.soundboard_clips (server_id, name, emoji, storage_path) values ($1, ' Awit ', '😭', $2)", [serverId, path]);
    expect(await failure(db, "insert into public.soundboard_clips (server_id, name, storage_path) values ($1, 'x', 'other/../x.mp3')", [serverId])).toMatch(/INVALID_CLIP_PATH/);
    expect(await failure(db, "insert into storage.objects (bucket_id, name) values ('soundboard', $1)", [`${serverId}/clip.wav`])).toMatch(/row-level security/);
    for (let i = 0; i < 23; i++) {
      await db.query("insert into public.soundboard_clips (server_id, name, storage_path) values ($1, $2, $3)", [serverId, `clip ${i}`, `${serverId}/${randomUUID()}.mp3`]);
    }
    expect(await failure(db, "insert into public.soundboard_clips (server_id, name, storage_path) values ($1, 'one too many', $2)", [serverId, `${serverId}/${randomUUID()}.mp3`])).toMatch(/SOUNDBOARD_FULL/);

    await asUser(db, member);
    expect((await one<{ name: string }>(db, "select name from public.soundboard_clips where storage_path = $1", [path])).name).toBe("Awit");
    expect(await rows(db, "select 1 from storage.objects where bucket_id = 'soundboard' and name = $1", [path])).toHaveLength(1);
    await asUser(db, outsider);
    expect(await rows(db, "select * from public.soundboard_clips")).toHaveLength(0);
    expect(await rows(db, "select 1 from storage.objects where bucket_id = 'soundboard'")).toHaveLength(0);
    expect(await audit("soundboard.add")).toHaveLength(24);
  });
});

describe("friends", () => {
  it("sends requests by @username and accepts them", async () => {
    await asUser(db, member);
    expect((await one<{ s: string }>(db, "select public.send_friend_request('@DAYO') s")).s).toBe("pending");
    expect((await one<{ s: string }>(db, "select public.send_friend_request('dayo') s")).s).toBe("pending");
    expect(await failure(db, "select public.send_friend_request('juan')")).toMatch(/CANNOT_FRIEND_SELF/);
    expect(await failure(db, "select public.send_friend_request('walangganito')")).toMatch(/USER_NOT_FOUND/);
    expect(await failure(db, "select public.respond_friend_request($1, true)", [outsider])).toMatch(/REQUEST_NOT_FOUND/);

    await asUser(db, outsider);
    expect(await rows(db, "select * from public.friendships")).toHaveLength(1);
    await db.query("select public.respond_friend_request($1, true)", [member]);
    expect((await one<{ status: string }>(db, "select status from public.friendships")).status).toBe("accepted");
    await asUser(db, owner);
    expect(await rows(db, "select * from public.friendships")).toHaveLength(0);
    expect(await failure(db, "insert into public.friendships (user_low, user_high, requested_by, status) values ($1, $2, $1, 'accepted')", [owner, mod].sort())).toMatch(/permission denied/);
  });

  it("accepts automatically when both sides send a request", async () => {
    await asUser(db, mod);
    await db.query("select public.send_friend_request('juan')");
    await asUser(db, member);
    expect((await one<{ s: string }>(db, "select public.send_friend_request('bantay') s")).s).toBe("accepted");
  });

  it("blocking removes the friendship and hides the blocker from requests", async () => {
    await asUser(db, owner);
    await db.query("select public.send_friend_request('dayo')");
    await asUser(db, outsider);
    await db.query("select public.block_user($1)", [owner]);
    await asUser(db, owner);
    expect(await rows(db, "select * from public.friendships")).toHaveLength(0);
    expect(await failure(db, "select public.send_friend_request('dayo')")).toMatch(/USER_NOT_FOUND/);
    await asUser(db, outsider);
    expect(await rows(db, "select blocked_id from public.user_blocks")).toEqual([{ blocked_id: owner }]);
    await db.query("select public.unblock_user($1)", [owner]);
    await asUser(db, owner);
    expect(await failure(db, "select public.send_friend_request('dayo')")).toBeNull();
  });
});

describe("direct messages", () => {
  let dm: string;

  it("opens a 1:1 DM only between friends, idempotently", async () => {
    await asUser(db, member);
    dm = (await one<{ id: string }>(db, "select public.open_dm($1) id", [outsider])).id;
    expect((await one<{ id: string }>(db, "select public.open_dm($1) id", [outsider])).id).toBe(dm);
    expect(await failure(db, "select public.open_dm($1)", [unverified])).toMatch(/DM_NOT_ALLOWED/);
    expect(await failure(db, "insert into public.dm_conversations (kind, direct_key) values ('direct', 'x')")).toMatch(/permission denied/);
  });

  it("delivers messages to participants only", async () => {
    await asUser(db, member);
    await db.query("insert into public.direct_messages (conversation_id, author_id, content) values ($1, $2, 'Uy, laro tayo mamaya?')", [dm, member]);
    await asUser(db, outsider);
    const msgs = await rows<{ author_id: string; content: string }>(db, "select author_id, content from public.direct_messages where conversation_id = $1", [dm]);
    expect(msgs).toEqual([{ author_id: member, content: "Uy, laro tayo mamaya?" }]);
    await db.query("insert into public.direct_messages (conversation_id, author_id, content) values ($1, $2, 'G!')", [dm, member]); // author is forced to the caller
    expect((await one<{ a: string }>(db, "select author_id a from public.direct_messages where content = 'G!'")).a).toBe(outsider);

    await asUser(db, owner);
    expect(await rows(db, "select * from public.direct_messages")).toHaveLength(0);
    expect(await rows(db, "select * from public.dm_conversations")).toHaveLength(0);
    expect(await failure(db, "insert into public.direct_messages (conversation_id, author_id, content) values ($1, $2, 'sneaky')", [dm, owner])).toMatch(/DM_NOT_ALLOWED|row-level security/);
    expect((await one<{ ok: boolean }>(db, "select public.can_access_realtime_topic($1) ok", [`dm:${dm}`])).ok).toBe(false);
    expect((await one<{ ok: boolean }>(db, "select public.can_access_realtime_topic($1) ok", [`db:dm:${dm}`])).ok).toBe(false);
    await asUser(db, member);
    expect((await one<{ ok: boolean }>(db, "select public.can_access_realtime_topic($1) ok", [`dm:${dm}`])).ok).toBe(true);
    expect((await one<{ ok: boolean }>(db, "select public.can_access_realtime_topic($1) ok", [`db:dm:${dm}`])).ok).toBe(true);
  });

  it("refuses phishing links, and edits by anyone but the author", async () => {
    await asUser(db, member);
    expect(await failure(db, "insert into public.direct_messages (conversation_id, author_id, content) values ($1, $2, 'https://gcash-verify.top/login')", [dm, member])).toMatch(/AUTOMOD_BLOCKED/);
    await asUser(db, outsider);
    await db.query("update public.direct_messages set content = 'hacked' where author_id <> $1", [outsider]);
    await asService(db);
    expect(await rows(db, "select 1 from public.direct_messages where content = 'hacked'")).toHaveLength(0);
  });

  it("stops 1:1 messages once the friendship ends or someone blocks", async () => {
    await asUser(db, outsider);
    await db.query("select public.remove_friend($1)", [member]);
    await asUser(db, member);
    expect(await failure(db, "insert into public.direct_messages (conversation_id, author_id, content) values ($1, $2, 'hello?')", [dm, member])).toMatch(/DM_NOT_ALLOWED/);
    expect(await rows(db, "select 1 from public.direct_messages where conversation_id = $1", [dm])).toHaveLength(2); // history stays readable
  });

  it("creates group DMs of friends only, 3 to 10 people", async () => {
    const friend3 = await signUp(db, "tropa@diskarte.ph", { username: "tropa" });
    await asUser(db, friend3);
    await db.query("select public.send_friend_request('juan')");
    await asUser(db, member);
    await db.query("select public.respond_friend_request($1, true)", [friend3]);
    expect(await failure(db, "select public.create_group_dm(array[$1]::uuid[])", [mod])).toMatch(/INVALID_GROUP_SIZE/);
    expect(await failure(db, "select public.create_group_dm(array[$1, $2]::uuid[])", [mod, owner])).toMatch(/DM_NOT_ALLOWED/);
    const group = (await one<{ id: string }>(db, "select public.create_group_dm(array[$1, $2]::uuid[], ' Squad ') id", [mod, friend3])).id;
    await db.query("insert into public.direct_messages (conversation_id, author_id, content) values ($1, $2, 'Tara, Valo')", [group, member]);

    await asUser(db, friend3);
    expect((await one<{ name: string; kind: string }>(db, "select name, kind from public.dm_conversations where id = $1", [group]))).toEqual({ name: "Squad", kind: "group" });
    expect(await rows(db, "select user_id from public.dm_participants where conversation_id = $1", [group])).toHaveLength(3);
    await db.query("select public.leave_dm($1)", [group]);
    expect(await rows(db, "select * from public.direct_messages where conversation_id = $1", [group])).toHaveLength(0);
    await asUser(db, member);
    expect(await failure(db, "select public.leave_dm($1)", [dm])).toMatch(/DM_NOT_ALLOWED/); // 1:1 DMs can't be "left"
    await db.query("select public.mark_dm_read($1)", [group]);
  });
});

describe("anonymous access", () => {
  it("sees none of the new tables", async () => {
    await asAnon(db);
    for (const table of ["audit_logs", "server_bans", "server_badges", "lfg_beacons", "soundboard_clips", "friendships", "direct_messages", "dm_conversations"]) {
      expect(await failure(db, `select * from public.${table}`)).toMatch(/permission denied/);
    }
    expect(await failure(db, "select public.send_friend_request('juan')")).toMatch(/permission denied/);
  });

  it("doesn't let signed-in users probe other people's friendships or blocks", async () => {
    await asUser(db, owner);
    expect(await failure(db, "select public.are_friends($1, $2)", [member, outsider])).toMatch(/permission denied/);
    expect(await failure(db, "select public.is_blocked_between($1, $2)", [member, outsider])).toMatch(/permission denied/);
    expect(await failure(db, "select public.automod_match('x', array['spam'])")).toMatch(/permission denied/);
  });
});
