// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asService, asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let owner: string;
let mod: string;
let member: string;
let outsider: string;
let serverId: string;
let inviteCode: string;
let general: string;
let voice: string;

async function channelId(name: string) {
  await asService(db);
  const row = await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and name = $2", [serverId, name]);
  return row.id;
}

async function send(userId: string, content: string, extra: Record<string, unknown> = {}) {
  await asUser(db, userId);
  const row = await one<{ id: string }>(
    db,
    "insert into public.messages (channel_id, author_id, content, attachments) values ($1, $2, $3, $4) returning id",
    [extra.channel ?? general, extra.author ?? userId, content, JSON.stringify(extra.attachments ?? [])],
  );
  return row.id;
}

/** Push a user's recent messages into the past so the rate limiter does not interfere. */
async function ageMessages(userId: string) {
  await asService(db);
  await db.query("update public.messages set created_at = created_at - interval '1 minute' where author_id = $1", [userId]);
}

beforeAll(async () => {
  db = await createDb();
  owner = await signUp(db, "owner@diskarte.ph", { username: "Kapitan", full_name: "Kapitan Tiago" });
  mod = await signUp(db, "mod@diskarte.ph");
  member = await signUp(db, "member@diskarte.ph", { user_name: "juan.tamad" });
  outsider = await signUp(db, "outsider@diskarte.ph");

  await asUser(db, owner);
  serverId = (await one<{ id: string }>(db, "select public.create_server('Barkada HQ', 'Tambayan ng tropa') as id")).id;
  inviteCode = (await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [serverId])).invite_code;

  for (const uid of [mod, member]) {
    await asUser(db, uid);
    await db.query("select public.join_server($1)", [inviteCode.toLowerCase()]);
  }
  await asUser(db, owner);
  await db.query("update public.members set role = 'moderator' where server_id = $1 and user_id = $2", [serverId, mod]);

  general = await channelId("general");
  voice = await channelId("Tambayan 1");
}, 60_000);

describe("profiles", () => {
  it("creates a sanitised, unique profile for every sign-up", async () => {
    await asService(db);
    const profiles = await rows<{ id: string; username: string; display_name: string }>(db, "select id, username, display_name from public.profiles");
    const byId = Object.fromEntries(profiles.map((p) => [p.id, p]));
    expect(byId[owner]).toMatchObject({ username: "kapitan", display_name: "Kapitan Tiago" });
    expect(byId[member].username).toBe("juan.tamad");
    expect(new Set(profiles.map((p) => p.username)).size).toBe(profiles.length);
  });

  it("lets users edit only their own profile", async () => {
    await asUser(db, member);
    await db.query("update public.profiles set bio = 'Nagluto ng Canton' where id = $1", [owner]);
    await db.query("update public.profiles set custom_status = 'LFG' where id = $1", [member]);
    await asService(db);
    expect((await one<{ bio: string }>(db, "select bio from public.profiles where id = $1", [owner])).bio).toBe("");
    expect((await one<{ custom_status: string }>(db, "select custom_status from public.profiles where id = $1", [member])).custom_status).toBe("LFG");
  });

  it("checks username availability for anonymous visitors", async () => {
    await asAnon(db);
    expect((await one<{ ok: boolean }>(db, "select public.username_available('KAPITAN') as ok")).ok).toBe(false);
    expect((await one<{ ok: boolean }>(db, "select public.username_available('bagong_user') as ok")).ok).toBe(true);
    expect((await one<{ ok: boolean }>(db, "select public.username_available('x') as ok")).ok).toBe(false);
  });

  it("rejects invalid usernames", async () => {
    await asUser(db, member);
    expect(await failure(db, "update public.profiles set username = 'Bad Name!' where id = $1", [member])).toMatch(/check constraint/);
  });
});

describe("servers & membership", () => {
  it("bootstraps the owner as admin with default channels", async () => {
    await asUser(db, owner);
    const me = await one<{ role: string }>(db, "select role from public.members where server_id = $1 and user_id = $2", [serverId, owner]);
    expect(me.role).toBe("admin");
    const channels = await rows<{ name: string; type: string }>(db, "select name, type from public.channels where server_id = $1 order by position", [serverId]);
    expect(channels.map((c) => c.name)).toEqual(["general", "chika", "lfg-valorant", "Tambayan 1", "Chill & Music"]);
    expect(channels.filter((c) => c.type === "voice")).toHaveLength(2);
  });

  it("hides servers, channels and messages from non-members", async () => {
    await send(member, "Kumain ka na?");
    await asUser(db, outsider);
    expect(await rows(db, "select * from public.servers where id = $1", [serverId])).toHaveLength(0);
    expect(await rows(db, "select * from public.channels where server_id = $1", [serverId])).toHaveLength(0);
    expect(await rows(db, "select * from public.messages where server_id = $1", [serverId])).toHaveLength(0);
    expect(await rows(db, "select * from public.members where server_id = $1", [serverId])).toHaveLength(0);
  });

  it("previews invites for anonymous visitors without leaking membership", async () => {
    await asAnon(db);
    const preview = await one<{ name: string; member_count: number; already_member: boolean }>(db, "select * from public.get_invite($1)", [inviteCode]);
    expect(preview).toMatchObject({ name: "Barkada HQ", already_member: false });
    expect(Number(preview.member_count)).toBe(3);
    expect(await failure(db, "select public.join_server($1)", [inviteCode])).toMatch(/permission denied/);
    // anon has no table privileges at all (security hardening migration).
    for (const table of ["profiles", "servers", "members", "channels", "messages", "reactions"]) {
      expect(await failure(db, `select * from public.${table}`)).toMatch(/permission denied/);
    }
  });

  it("rejects unknown invite codes", async () => {
    await asUser(db, outsider);
    expect(await failure(db, "select public.join_server('NOPE123456')")).toMatch(/INVITE_NOT_FOUND/);
  });

  it("blocks direct inserts into members and servers", async () => {
    await asUser(db, outsider);
    expect(await failure(db, "insert into public.members (server_id, user_id, role) values ($1, $2, 'admin')", [serverId, outsider])).toMatch(/row-level security/);
    expect(await failure(db, "insert into public.servers (name, owner_id) values ('Sneaky', $1)", [outsider])).toMatch(/row-level security/);
  });

  it("only admins regenerate invite codes", async () => {
    await asUser(db, mod);
    expect(await failure(db, "select public.regenerate_invite($1)", [serverId])).toMatch(/ONLY_ADMINS/);
    await asUser(db, owner);
    const fresh = await one<{ code: string }>(db, "select public.regenerate_invite($1) as code", [serverId]);
    expect(fresh.code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
    expect(fresh.code).not.toBe(inviteCode);
    inviteCode = fresh.code;
  });
});

describe("role-based access control", () => {
  it("prevents members from promoting themselves", async () => {
    await asUser(db, member);
    expect(await failure(db, "update public.members set role = 'admin' where server_id = $1 and user_id = $2", [serverId, member])).toMatch(/ONLY_ADMINS_CAN_CHANGE_ROLES/);
  });

  it("prevents moderators from changing roles", async () => {
    await asUser(db, mod);
    expect(await failure(db, "update public.members set role = 'moderator' where server_id = $1 and user_id = $2", [serverId, member])).toMatch(/ONLY_ADMINS_CAN_CHANGE_ROLES/);
  });

  it("protects the owner's admin role", async () => {
    await asUser(db, owner);
    expect(await failure(db, "update public.members set role = 'member' where server_id = $1 and user_id = $2", [serverId, owner])).toMatch(/CANNOT_CHANGE_OWNER_ROLE/);
  });

  it("lets moderators kick members but not admins", async () => {
    const temp = await signUp(db, "temp@diskarte.ph");
    await asUser(db, temp);
    await db.query("select public.join_server($1)", [inviteCode]);
    await asUser(db, mod);
    expect(await failure(db, "delete from public.members where server_id = $1 and user_id = $2", [serverId, owner])).toMatch(/OWNER_CANNOT_LEAVE|CANNOT_KICK/);
    await db.query("delete from public.members where server_id = $1 and user_id = $2", [serverId, temp]);
    await asService(db);
    expect(await rows(db, "select 1 from public.members where server_id = $1 and user_id = $2", [serverId, temp])).toHaveLength(0);
  });

  it("lets the owner kick another admin, but not admins each other", async () => {
    const admin2 = await signUp(db, "admin2@diskarte.ph");
    const admin3 = await signUp(db, "admin3@diskarte.ph");
    for (const uid of [admin2, admin3]) {
      await asUser(db, uid);
      await db.query("select public.join_server($1)", [inviteCode]);
      await asUser(db, owner);
      await db.query("update public.members set role = 'admin' where server_id = $1 and user_id = $2", [serverId, uid]);
    }
    await asUser(db, admin2);
    expect(await failure(db, "delete from public.members where server_id = $1 and user_id = $2", [serverId, admin3])).toMatch(/CANNOT_KICK_MEMBER/);
    await asUser(db, owner);
    await db.query("delete from public.members where server_id = $1 and user_id in ($2, $3)", [serverId, admin2, admin3]);
    await asService(db);
    expect(await rows(db, "select 1 from public.members where server_id = $1 and user_id in ($2, $3)", [serverId, admin2, admin3])).toHaveLength(0);
  });

  it("does not let members kick each other", async () => {
    await asUser(db, member);
    // RLS filters the target row out, so the delete is a silent no-op.
    await db.query("delete from public.members where server_id = $1 and user_id = $2", [serverId, mod]);
    await asService(db);
    expect(await rows(db, "select 1 from public.members where server_id = $1 and user_id = $2", [serverId, mod])).toHaveLength(1);
  });

  it("lets only moderators manage channels", async () => {
    await asUser(db, member);
    expect(await failure(db, "insert into public.channels (server_id, name) values ($1, 'hacked')", [serverId])).toMatch(/row-level security/);
    await asUser(db, mod);
    await db.query("insert into public.channels (server_id, name, category) values ($1, 'memes', 'Text Channels')", [serverId]);
    expect(await failure(db, "insert into public.channels (server_id, name) values ($1, 'Has Spaces')", [serverId])).toMatch(/channels_name_format/);
  });
});

describe("messages", () => {
  it("derives server_id and forces the author to the caller", async () => {
    await ageMessages(member);
    await asUser(db, member);
    const row = await one<{ author_id: string; server_id: string; content: string }>(
      db,
      "insert into public.messages (channel_id, author_id, content) values ($1, $2, '  Mabuhay!  ') returning author_id, server_id, content",
      [general, member],
    );
    expect(row).toMatchObject({ author_id: member, server_id: serverId, content: "Mabuhay!" });
    const spoofed = await one<{ author_id: string }>(
      db,
      "insert into public.messages (channel_id, author_id, content) values ($1, $2, 'impostor') returning author_id",
      [general, owner],
    );
    expect(spoofed.author_id).toBe(member);
  });

  it("rejects messages in voice channels and empty messages", async () => {
    await asUser(db, member);
    expect(await failure(db, "insert into public.messages (channel_id, author_id, content) values ($1, $2, 'hello?')", [voice, member])).toMatch(/NOT_A_TEXT_CHANNEL/);
    expect(await failure(db, "insert into public.messages (channel_id, author_id, content) values ($1, $2, '   ')", [general, member])).toMatch(/messages_not_empty/);
  });

  it("rate limits bursts of messages", async () => {
    const spammer = await signUp(db, "spam@diskarte.ph");
    await asUser(db, spammer);
    await db.query("select public.join_server($1)", [inviteCode]);
    for (let i = 0; i < 8; i++) await send(spammer, `spam ${i}`);
    expect(await failure(db, "insert into public.messages (channel_id, author_id, content) values ($1, $2, 'one more')", [general, spammer])).toMatch(/RATE_LIMITED/);
  });

  it("lets authors edit (stamping edited_at) and blocks others", async () => {
    await ageMessages(member);
    const id = await send(member, "typo hehe");
    await asUser(db, mod);
    expect(await failure(db, "update public.messages set content = 'hijacked' where id = $1", [id])).toMatch(/ONLY_AUTHOR_CAN_EDIT/);
    await asUser(db, outsider);
    await db.query("update public.messages set content = 'hijacked' where id = $1", [id]);
    await asUser(db, member);
    const edited = await one<{ content: string; edited_at: string | null }>(db, "update public.messages set content = 'fixed na' where id = $1 returning content, edited_at", [id]);
    expect(edited.content).toBe("fixed na");
    expect(edited.edited_at).not.toBeNull();
  });

  it("lets only moderators pin", async () => {
    await ageMessages(member);
    const id = await send(member, "Pin this pls");
    await asUser(db, member);
    expect(await failure(db, "update public.messages set pinned = true where id = $1", [id])).toMatch(/ONLY_MODERATORS_CAN_PIN/);
    await asUser(db, mod);
    const pinned = await one<{ pinned: boolean; pinned_by: string; content: string }>(db, "update public.messages set pinned = true where id = $1 returning pinned, pinned_by, content", [id]);
    expect(pinned).toMatchObject({ pinned: true, pinned_by: mod, content: "Pin this pls" });
  });

  it("lets authors and moderators delete, but not other members", async () => {
    await ageMessages(member);
    const id = await send(member, "delete me");
    await asUser(db, outsider);
    await db.query("delete from public.messages where id = $1", [id]);
    await asService(db);
    expect(await rows(db, "select 1 from public.messages where id = $1", [id])).toHaveLength(1);
    await asUser(db, mod);
    await db.query("delete from public.messages where id = $1", [id]);
    await asService(db);
    expect(await rows(db, "select 1 from public.messages where id = $1", [id])).toHaveLength(0);
  });

  it("only accepts attachments stored under the uploader's own folder", async () => {
    await ageMessages(member);
    const good = { path: `${serverId}/${general}/${member}/11111111-2222-4333-8444-555555555555.png`, name: "photo.png", size: 1200, type: "image/png" };
    const bad = { ...good, path: `${serverId}/${general}/${owner}/11111111-2222-4333-8444-555555555555.png` };
    await send(member, "", { attachments: [good] });
    await asUser(db, member);
    expect(
      await failure(db, "insert into public.messages (channel_id, author_id, content, attachments) values ($1, $2, 'x', $3)", [general, member, JSON.stringify([bad])]),
    ).toMatch(/INVALID_ATTACHMENT/);
  });
});

describe("reactions", () => {
  it("lets members react as themselves and remove only their own", async () => {
    await ageMessages(member);
    const id = await send(member, "Petmalu!");
    await asUser(db, mod);
    const r = await one<{ channel_id: string; server_id: string; user_id: string }>(
      db,
      "insert into public.reactions (message_id, user_id, emoji) values ($1, $2, ':lodi:') returning channel_id, server_id, user_id",
      [id, mod],
    );
    expect(r).toMatchObject({ channel_id: general, server_id: serverId, user_id: mod });
    await asUser(db, member);
    await db.query("insert into public.reactions (message_id, user_id, emoji) values ($1, $2, '🔥')", [id, member]);
    await db.query("delete from public.reactions where message_id = $1 and user_id = $2", [id, mod]);
    await asService(db);
    expect(await rows(db, "select 1 from public.reactions where message_id = $1", [id])).toHaveLength(2);
    await asUser(db, outsider);
    expect(await failure(db, "insert into public.reactions (message_id, user_id, emoji) values ($1, $2, '👀')", [id, outsider])).toMatch(/row-level security/);
  });
});

describe("storage policies", () => {
  it("lets members upload attachments only into their own folder of a real channel", async () => {
    await asUser(db, member);
    await db.query("insert into storage.objects (bucket_id, name) values ('attachments', $1)", [`${serverId}/${general}/${member}/11111111-2222-4333-8444-555555555555.png`]);
    expect(
      await failure(db, "insert into storage.objects (bucket_id, name) values ('attachments', $1)", [`${serverId}/${general}/${owner}/11111111-2222-4333-8444-555555555555.png`]),
    ).toMatch(/row-level security/);
    await asUser(db, outsider);
    expect(
      await failure(db, "insert into storage.objects (bucket_id, name) values ('attachments', $1)", [`${serverId}/${general}/${outsider}/11111111-2222-4333-8444-555555555555.png`]),
    ).toMatch(/row-level security/);
    expect(await rows(db, "select * from storage.objects where bucket_id = 'attachments'")).toHaveLength(0);
  });

  it("scopes avatar uploads to the user's folder or admin-managed server icons", async () => {
    await asUser(db, member);
    await db.query("insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`${member}/avatar-11111111-2222-4333-8444-555555555555.png`]);
    expect(await failure(db, "insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`${owner}/avatar-11111111-2222-4333-8444-555555555555.png`])).toMatch(/row-level security/);
    expect(await failure(db, "insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`servers/${serverId}/icon-11111111-2222-4333-8444-555555555555.png`])).toMatch(/row-level security/);
    await asUser(db, owner);
    await db.query("insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`servers/${serverId}/icon-11111111-2222-4333-8444-555555555555.png`]);
  });
});

describe("realtime authorization", () => {
  it("allows private topics only for members", async () => {
    await asUser(db, member);
    expect((await one<{ ok: boolean }>(db, "select public.can_access_realtime_topic($1) as ok", [`server:${serverId}`])).ok).toBe(true);
    expect((await one<{ ok: boolean }>(db, "select public.can_access_realtime_topic($1) as ok", [`channel:${general}`])).ok).toBe(true);
    expect((await one<{ ok: boolean }>(db, "select public.can_access_realtime_topic('server:not-a-uuid') as ok")).ok).toBe(false);
    await asUser(db, outsider);
    expect((await one<{ ok: boolean }>(db, "select public.can_access_realtime_topic($1) as ok", [`server:${serverId}`])).ok).toBe(false);
  });

  // With "Allow public access" off, Realtime rejects every non-private channel — including the
  // `db:*` Postgres Changes subscriptions — so each one must be authorised like any other topic.
  it("authorises the private db:* Postgres Changes topics", async () => {
    const allowed = async (topic: string) => (await one<{ ok: boolean }>(db, "select public.can_access_realtime_topic($1) as ok", [topic])).ok;
    await asUser(db, member);
    expect(await allowed(`db:chat:${general}`)).toBe(true);
    expect(await allowed(`db:chat:${general}:${general}`)).toBe(true);
    expect(await allowed(`db:server:${serverId}`)).toBe(true);
    expect(await allowed(`db:lfg:${serverId}`)).toBe(true);
    expect(await allowed(`db:memberships:${member}`)).toBe(true);
    expect(await allowed(`db:friends:${member}`)).toBe(true);
    expect(await allowed(`db:dms:${member}`)).toBe(true);
    expect(await allowed(`db:memberships:${owner}`)).toBe(false);
    expect(await allowed(`db:friends:${owner}`)).toBe(false);
    expect(await allowed(`db:dms:${owner}`)).toBe(false);
    expect(await allowed(`db:chat:not-a-uuid`)).toBe(false);
    expect(await allowed(`db:unknown:${serverId}`)).toBe(false);

    await asUser(db, outsider);
    expect(await allowed(`db:chat:${general}`)).toBe(false);
    expect(await allowed(`db:server:${serverId}`)).toBe(false);
    expect(await allowed(`db:lfg:${serverId}`)).toBe(false);
  });

  it("lets members join db:* topics but never broadcast on them", async () => {
    await asUser(db, member);
    await db.query("select set_config('realtime.topic', $1, false)", [`db:chat:${general}`]);
    expect(await failure(db, "insert into realtime.messages (topic, payload) values ($1, '{}')", [`db:chat:${general}`])).toMatch(/row-level security/);
    await db.query("select set_config('realtime.topic', $1, false)", [`channel:${general}`]);
    expect(await failure(db, "insert into realtime.messages (topic, payload) values ($1, '{}')", [`channel:${general}`])).toBeNull();
    await db.query("select set_config('realtime.topic', '', false)");
  });
});

describe("server deletion", () => {
  it("lets only the owner delete, cascading every member", async () => {
    await asUser(db, mod);
    await db.query("delete from public.servers where id = $1", [serverId]);
    await asService(db);
    expect(await rows(db, "select 1 from public.servers where id = $1", [serverId])).toHaveLength(1);
    await asUser(db, owner);
    await db.query("delete from public.servers where id = $1", [serverId]);
    await asService(db);
    expect(await rows(db, "select 1 from public.servers where id = $1", [serverId])).toHaveLength(0);
    expect(await rows(db, "select 1 from public.members where server_id = $1", [serverId])).toHaveLength(0);
    expect(await rows(db, "select 1 from public.messages where server_id = $1", [serverId])).toHaveLength(0);
  });
});
