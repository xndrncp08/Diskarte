// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let owner: string; // server owner (admin)
let mod: string; // moderator, no grant on the private channels
let insider: string; // member granted into the private channels
let member: string; // plain member, no grant
let ghost: string; // goes invisible
let friend: string; // ghost's friend, shares no server
let outsider: string; // nobody
let serverId: string;
let general: string;
let secretText: string;
let secretVoice: string;
let publicVoice: string;

/** Simulates Realtime's authorisation probe: an insert into realtime.messages on a topic. */
async function publish(user: string, topic: string, extension: "presence" | "broadcast") {
  await asUser(db, user);
  await db.query("select set_config('realtime.topic', $1, false)", [topic]);
  return failure(db, "insert into realtime.messages (topic, extension, payload) values ($1, $2, '{}')", [topic, extension]);
}

async function canJoin(user: string, topic: string) {
  await asUser(db, user);
  return (await one<{ ok: boolean }>(db, "select public.can_access_realtime_topic($1) as ok", [topic])).ok;
}

/** Audit rows the user can read about a channel (by target or by metadata.channel_id). */
async function auditAbout(user: string, channel: string) {
  await asUser(db, user);
  return rows<{ action: string }>(
    db,
    "select action from public.audit_logs where server_id = $1 and (target_id = $2 or metadata ->> 'channel_id' = $2::text) order by id",
    [serverId, channel],
  );
}

beforeAll(async () => {
  db = await createDb();
  owner = await signUp(db, "owner@diskarte.ph", { username: "kapitan" });
  mod = await signUp(db, "mod@diskarte.ph", { username: "bantay" });
  insider = await signUp(db, "insider@diskarte.ph", { username: "loob" });
  member = await signUp(db, "member@diskarte.ph", { username: "juan" });
  ghost = await signUp(db, "ghost@diskarte.ph", { username: "multo" });
  friend = await signUp(db, "friend@diskarte.ph", { username: "kaibigan" });
  outsider = await signUp(db, "outsider@diskarte.ph", { username: "dayo" });

  await asUser(db, owner);
  serverId = (await one<{ id: string }>(db, "select public.create_server('Barkada', 'Tropa') as id")).id;
  const { invite_code } = await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [serverId]);
  for (const u of [mod, insider, member, ghost]) {
    await asUser(db, u);
    await db.query("select public.join_server($1)", [invite_code]);
  }
  await asUser(db, owner);
  await db.query("update public.members set role = 'moderator' where server_id = $1 and user_id = $2", [serverId, mod]);
  general = (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and type = 'text' order by position limit 1", [serverId])).id;
  secretText = (await one<{ id: string }>(db, "insert into public.channels (server_id, name, type, is_private) values ($1, 'vip', 'text', true) returning id", [serverId])).id;
  secretVoice = (await one<{ id: string }>(db, "insert into public.channels (server_id, name, type, is_private) values ($1, 'vip-voice', 'voice', true) returning id", [serverId])).id;
  publicVoice = (await one<{ id: string }>(db, "insert into public.channels (server_id, name, type) values ($1, 'tambayan', 'voice') returning id", [serverId])).id;
  for (const channel of [secretText, secretVoice]) {
    await db.query("insert into public.channel_access (channel_id, server_id, user_id) values ($1, $2, $3)", [channel, serverId, insider]);
  }

  await asService(db);
  await db.query("insert into public.friendships (user_low, user_high, requested_by, status) values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid), $1, 'accepted')", [ghost, friend]);
}, 60_000);

describe("invisible stays private", () => {
  it("never shows 'invisible' to anyone else, and the public status doesn't change", async () => {
    await asUser(db, ghost);
    await db.query("update public.profiles set status = 'dnd' where id = $1", [ghost]);
    await db.query("update public.profiles set status = 'invisible' where id = $1", [ghost]);
    for (const viewer of [friend, member, mod, owner, outsider]) {
      await asUser(db, viewer);
      expect(await one(db, "select status from public.profiles where id = $1", [ghost])).toEqual({ status: "dnd" });
      expect(await rows(db, "select id from public.profiles where status = 'invisible'")).toEqual([]);
      expect(await rows(db, "select invisible from public.privacy_settings where user_id = $1", [ghost])).toEqual([]);
    }
  });

  it("lets the user read their own real choice", async () => {
    await asUser(db, ghost);
    expect(await one(db, "select invisible from public.privacy_settings where user_id = $1", [ghost])).toEqual({ invisible: true });
  });

  it("refuses presence from an invisible user on every topic, but not broadcasts or reading", async () => {
    expect(await publish(ghost, `server:${serverId}`, "presence")).toMatch(/row-level security/);
    expect(await publish(ghost, `voice:${publicVoice}`, "presence")).toMatch(/row-level security/);
    expect(await publish(ghost, `server:${serverId}`, "broadcast")).toBeNull();
    expect(await canJoin(ghost, `server:${serverId}`)).toBe(true);
    expect(await publish(member, `server:${serverId}`, "presence")).toBeNull();
  });

  it("can't be written straight into profiles", async () => {
    await asService(db);
    expect(await failure(db, "update public.profiles set status = 'invisible', display_name = display_name where id = $1", [member])).toBeNull();
    expect(await one(db, "select status from public.profiles where id = $1", [member])).toEqual({ status: "online" });
    await db.query("alter table public.profiles disable trigger profiles_hide_invisible");
    expect(await failure(db, "update public.profiles set status = 'invisible' where id = $1", [member])).toMatch(/profiles_status_not_invisible/);
    await db.query("alter table public.profiles enable trigger profiles_hide_invisible");
    await db.query("update public.privacy_settings set invisible = false where user_id = $1", [member]);
  });

  it("doesn't touch the public profile row (not even updated_at) when choosing Invisible", async () => {
    await asService(db);
    const before = await one(db, "select * from public.profiles where id = $1", [ghost]);
    await asUser(db, ghost);
    await db.query("update public.profiles set status = 'invisible' where id = $1", [ghost]);
    await asService(db);
    expect(await one(db, "select * from public.profiles where id = $1", [ghost])).toEqual(before);
    expect(await one(db, "select invisible from public.privacy_settings where user_id = $1", [ghost])).toEqual({ invisible: true });
  });

  it("picking a visible status again clears it and allows presence", async () => {
    await asUser(db, ghost);
    await db.query("update public.profiles set status = 'idle' where id = $1", [ghost]);
    expect(await one(db, "select status from public.profiles where id = $1", [ghost])).toEqual({ status: "idle" });
    expect(await one(db, "select invisible from public.privacy_settings where user_id = $1", [ghost])).toEqual({ invisible: false });
    expect(await publish(ghost, `server:${serverId}`, "presence")).toBeNull();
  });
});

describe("friends around and the heartbeat follow the private invisible flag", () => {
  const beat = async (user: string, status: string) => {
    await asUser(db, user);
    return (await one<{ r: Record<string, unknown> }>(db, "select public.heartbeat_device(gen_random_uuid(), '0123456789abcdef', 'test', $1::public.presence_status) r", [status])).r;
  };
  const around = async () => {
    await asUser(db, friend);
    return (await rows<{ user_id: string }>(db, "select user_id from public.friends_activity()")).map((r) => r.user_id);
  };

  it("hides an invisible friend whose stale tab still reports online, and tells that tab", async () => {
    await asUser(db, ghost);
    await db.query("update public.profiles set status = 'invisible' where id = $1", [ghost]);
    const reply = await beat(ghost, "online");
    expect(reply).toMatchObject({ signOut: false, invisible: true, status: "idle" });
    expect(typeof reply.invisibleAt).toBe("string");
    expect(await around()).not.toContain(ghost);
  });

  it("shows them again once visible", async () => {
    await asUser(db, ghost);
    await db.query("update public.profiles set status = 'online' where id = $1", [ghost]);
    expect(await beat(ghost, "online")).toMatchObject({ invisible: false, status: "online" });
    expect(await around()).toContain(ghost);
  });
});

describe("private voice occupancy", () => {
  it("only people let into a private voice channel may join or publish on its voice topic", async () => {
    for (const allowed of [owner, insider]) {
      expect(await canJoin(allowed, `voice:${secretVoice}`)).toBe(true);
      expect(await publish(allowed, `voice:${secretVoice}`, "presence")).toBeNull();
    }
    for (const denied of [mod, member, outsider, friend]) {
      expect(await canJoin(denied, `voice:${secretVoice}`)).toBe(false);
      expect(await publish(denied, `voice:${secretVoice}`, "presence")).toMatch(/row-level security/);
    }
  });

  it("public voice topics follow server membership", async () => {
    expect(await canJoin(member, `voice:${publicVoice}`)).toBe(true);
    expect(await canJoin(outsider, `voice:${publicVoice}`)).toBe(false);
    expect(await canJoin(member, "voice:not-a-uuid")).toBe(false);
  });
});

describe("audit log follows private channel access", () => {
  let gone: string;

  beforeAll(async () => {
    await asUser(db, insider);
    const secretMessage = (await one<{ id: string }>(db, "insert into public.messages (channel_id, server_id, author_id, content) values ($1, $2, $3, 'x') returning id", [secretText, serverId, insider])).id;
    const secretPinned = (await one<{ id: string }>(db, "insert into public.messages (channel_id, server_id, author_id, content) values ($1, $2, $3, 'y') returning id", [secretText, serverId, insider])).id;
    await asUser(db, member);
    const publicMessage = (await one<{ id: string }>(db, "insert into public.messages (channel_id, server_id, author_id, content) values ($1, $2, $3, 'z') returning id", [general, serverId, member])).id;
    await asUser(db, owner);
    await db.query("update public.messages set pinned = true where id = $1", [secretPinned]);
    await db.query("delete from public.messages where id = $1", [secretMessage]);
    await db.query("update public.channels set topic = 'shh' where id = $1", [secretText]);
    gone = (await one<{ id: string }>(db, "insert into public.channels (server_id, name, type, is_private) values ($1, 'temp', 'text', true) returning id", [serverId])).id;
    await db.query("delete from public.channels where id = $1", [gone]);
    await asUser(db, mod);
    await db.query("delete from public.messages where id = $1", [publicMessage]);
  });

  it("hides a private channel's rows from a moderator without a grant", async () => {
    expect(await auditAbout(mod, secretText)).toEqual([]);
    expect(await auditAbout(mod, secretVoice)).toEqual([]);
    expect(await auditAbout(mod, gone)).toEqual([]);
  });

  it("keeps public-channel, member and server entries for moderators", async () => {
    expect((await auditAbout(mod, general)).map((r) => r.action)).toContain("message.delete");
    await asUser(db, mod);
    const actions = (await rows<{ action: string }>(db, "select action from public.audit_logs where server_id = $1", [serverId])).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["member.join", "member.role_update", "channel.create", "message.delete"]));
  });

  it("shows them to a moderator once let in, except for a deleted private channel", async () => {
    await asUser(db, owner);
    await db.query("insert into public.channel_access (channel_id, server_id, user_id) values ($1, $2, $3)", [secretText, serverId, mod]);
    expect((await auditAbout(mod, secretText)).map((r) => r.action)).toEqual(
      expect.arrayContaining(["channel.create", "message.pin", "message.delete", "channel.update"]),
    );
    expect(await auditAbout(mod, gone)).toEqual([]);
    await asUser(db, owner);
    await db.query("delete from public.channel_access where channel_id = $1 and user_id = $2", [secretText, mod]);
    expect(await auditAbout(mod, secretText)).toEqual([]);
  });

  it("hides auto-mod blocks in a private channel from a moderator without a grant", async () => {
    await asUser(db, owner);
    await db.query("update public.servers set automod_enabled = true where id = $1", [serverId]);
    await asUser(db, insider);
    expect(await rows(db, "insert into public.messages (channel_id, server_id, author_id, content) values ($1, $2, $3, 'https://dlscord.gift/free') returning id", [secretText, serverId, insider])).toEqual([]);
    expect((await auditAbout(owner, secretText)).map((r) => r.action)).toContain("automod.block");
    expect((await auditAbout(mod, secretText)).map((r) => r.action)).not.toContain("automod.block");
  });

  it("follows the channel's current access when it's made private after rows were logged", async () => {
    await asUser(db, owner);
    const later = (await one<{ id: string }>(db, "insert into public.channels (server_id, name, type) values ($1, 'later', 'text') returning id", [serverId])).id;
    await asUser(db, member);
    const message = (await one<{ id: string }>(db, "insert into public.messages (channel_id, server_id, author_id, content) values ($1, $2, $3, 'a') returning id", [later, serverId, member])).id;
    await asUser(db, mod);
    await db.query("delete from public.messages where id = $1", [message]);
    expect((await auditAbout(mod, later)).map((r) => r.action)).toEqual(["channel.create", "message.delete"]);
    await asUser(db, owner);
    await db.query("update public.channels set is_private = true where id = $1", [later]);
    expect(await auditAbout(mod, later)).toEqual([]);
    expect(await auditAbout(owner, later)).toHaveLength(2);
  });

  it("backfills rows logged before the migration", async () => {
    const deleted = "00000000-0000-4000-8000-0000000000ff";
    await asService(db);
    await db.query("alter table public.audit_logs disable trigger audit_logs_tag_channel");
    await db.query(
      `insert into public.audit_logs (server_id, action, target_type, target_id, metadata) values
        ($1, 'legacy.private', 'message', null, jsonb_build_object('channel_id', $2::text)),
        ($1, 'legacy.public', 'channel', $3, '{}'),
        ($1, 'legacy.deleted', 'message', null, jsonb_build_object('channel_id', $4::text)),
        ($1, 'legacy.server', 'server', $1, '{}')`,
      [serverId, secretText, general, deleted],
    );
    await db.query("alter table public.audit_logs enable trigger audit_logs_tag_channel");
    expect(await rows(db, "select channel_id from public.audit_logs where action like 'legacy.%' and channel_id is not null")).toEqual([]);
    await db.query("select public.audit_logs_backfill_channels()");
    expect(
      await rows(db, "select action, channel_id, channel_private from public.audit_logs where action like 'legacy.%' order by action"),
    ).toEqual([
      { action: "legacy.deleted", channel_id: deleted, channel_private: true },
      { action: "legacy.private", channel_id: secretText, channel_private: true },
      { action: "legacy.public", channel_id: general, channel_private: false },
      { action: "legacy.server", channel_id: null, channel_private: false },
    ]);
    await asUser(db, mod);
    expect((await rows<{ action: string }>(db, "select action from public.audit_logs where action like 'legacy.%' order by action")).map((r) => r.action)).toEqual([
      "legacy.public",
      "legacy.server",
    ]);
    await asUser(db, owner);
    expect(await rows(db, "select action from public.audit_logs where action like 'legacy.%'")).toHaveLength(4);
  });

  it("can_read_audit_channel says nothing to non-moderators or about other servers' channels", async () => {
    const probe = async (user: string, server: string, channel: string, isPrivate: boolean) => {
      await asUser(db, user);
      return (await one<{ ok: boolean }>(db, "select public.can_read_audit_channel($1, $2, $3) as ok", [server, channel, isPrivate])).ok;
    };
    const unknown = "00000000-0000-4000-8000-0000000000fe";
    for (const user of [member, insider, outsider]) {
      expect(await probe(user, serverId, secretText, false)).toBe(false);
      expect(await probe(user, serverId, unknown, false)).toBe(false);
    }
    const stranger = await signUp(db, "stranger@diskarte.ph", { username: "estranghero" });
    await asUser(db, stranger);
    const elsewhere = (await one<{ id: string }>(db, "select public.create_server('Iba', 'Iba') as id")).id;
    const hidden = (await one<{ id: string }>(db, "insert into public.channels (server_id, name, type, is_private) values ($1, 'lihim', 'text', true) returning id", [elsewhere])).id;
    expect(await probe(mod, serverId, hidden, true)).toBe(await probe(mod, serverId, unknown, true));
    expect(await probe(mod, serverId, hidden, false)).toBe(await probe(mod, serverId, unknown, false));
  });

  it("gives admins everything", async () => {
    expect((await auditAbout(owner, secretText)).length).toBeGreaterThanOrEqual(4);
    expect((await auditAbout(owner, gone)).map((r) => r.action)).toEqual(["channel.create", "channel.delete"]);
  });

  it("gives members, the granted non-moderator and outsiders nothing", async () => {
    for (const user of [member, insider, outsider, friend]) {
      await asUser(db, user);
      expect(await rows(db, "select id from public.audit_logs")).toEqual([]);
    }
  });

  it("tags rows itself: callers can't write the audit log or pick its channel columns", async () => {
    await asUser(db, owner);
    expect(await failure(db, "insert into public.audit_logs (server_id, action, channel_id) values ($1, 'member.join', null)", [serverId])).toMatch(/permission denied/);
    await asService(db);
    const tagged = await one<{ channel_id: string; channel_private: boolean }>(
      db,
      "select channel_id, channel_private from public.audit_logs where action = 'message.pin' and server_id = $1",
      [serverId],
    );
    expect(tagged).toEqual({ channel_id: secretText, channel_private: true });
  });
});

describe("edit history follows the message", () => {
  let secretEdited: string;
  let publicEdited: string;
  const history = async (user: string, message: string) => {
    await asUser(db, user);
    return (await rows(db, "select id from public.message_edits where message_id = $1", [message])).length;
  };

  beforeAll(async () => {
    await asUser(db, insider);
    secretEdited = (await one<{ id: string }>(db, "insert into public.messages (channel_id, server_id, author_id, content) values ($1, $2, $3, 'first') returning id", [secretText, serverId, insider])).id;
    await db.query("update public.messages set content = 'second' where id = $1", [secretEdited]);
    await asUser(db, member);
    publicEdited = (await one<{ id: string }>(db, "insert into public.messages (channel_id, server_id, author_id, content) values ($1, $2, $3, 'one') returning id", [general, serverId, member])).id;
    await db.query("update public.messages set content = 'two' where id = $1", [publicEdited]);
  });

  it("hides a private channel's earlier versions from a moderator without a grant", async () => {
    expect(await history(mod, secretEdited)).toBe(0);
    expect(await history(mod, publicEdited)).toBe(1);
  });

  it("shows them to the author, an admin, and a moderator once let in", async () => {
    expect(await history(insider, secretEdited)).toBe(1);
    expect(await history(owner, secretEdited)).toBe(1);
    await asUser(db, owner);
    await db.query("insert into public.channel_access (channel_id, server_id, user_id) values ($1, $2, $3)", [secretText, serverId, mod]);
    expect(await history(mod, secretEdited)).toBe(1);
    await asUser(db, owner);
    await db.query("delete from public.channel_access where channel_id = $1 and user_id = $2", [secretText, mod]);
  });

  it("shows nothing to other members or outsiders", async () => {
    for (const user of [member, outsider, friend]) expect(await history(user, secretEdited)).toBe(0);
    for (const user of [insider, outsider]) expect(await history(user, publicEdited)).toBe(0);
  });
});
