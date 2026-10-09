// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asService, asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

const HQ = "d15ca47e-0000-4000-8000-000000000001";
const ANNOUNCEMENTS = "d15ca47e-0000-4000-8000-0000000000a1";
const LOUNGE = "d15ca47e-0000-4000-8000-0000000000a2";
const DEVICE = "6f1c2b9e-1111-4a2b-8c3d-000000000001";
const FINGERPRINT = "0123456789abcdef0123456789abcdef";

let db: Db;
let admin: string;
let juan: string;
let maria: string;
let pedro: string;

/** Run as a user whose access token was issued at `iat` (seconds). */
async function asUserAt(userId: string, iat: number) {
  await asUser(db, userId);
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: userId, iat })]);
}

async function heartbeat(userId: string, status = "online", voice: string | null = null) {
  await asUser(db, userId);
  return (await one<{ r: Record<string, unknown> }>(db, "select public.heartbeat_device($1, $2, 'Chrome on macOS', $3, null, $4) r", [DEVICE, FINGERPRINT, status, voice])).r;
}

beforeAll(async () => {
  db = await createDb();
  admin = await signUp(db, "admin@diskarte.ph", { username: "supremo" });
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
  maria = await signUp(db, "maria@diskarte.ph", { username: "maria" });
  pedro = await signUp(db, "pedro@diskarte.ph", { username: "pedro" });
  await asService(db);
  await db.query("insert into public.platform_admins (user_id, role) values ($1, 'super_admin')", [admin]);
}, 60_000);

describe("waitlist retirement", () => {
  it("drops the waitlist tables and functions", async () => {
    await asService(db);
    expect(await rows(db, "select 1 from information_schema.tables where table_schema = 'public' and table_name = 'waitlist_applications'")).toHaveLength(0);
    expect(await rows(db, "select 1 from pg_proc where proname in ('waitlist_stats', 'waitlist_before_insert', 'waitlist_before_update')")).toHaveLength(0);
    expect(await rows(db, "select 1 from pg_type where typname = 'waitlist_status'")).toHaveLength(0);
  });
});

describe("access guardrails", () => {
  it("refuses every Control Center RPC to standard members and anon", async () => {
    await asUser(db, juan);
    for (const sql of [
      "select public.admin_overview()",
      "select * from public.admin_list_users()",
      `select public.admin_set_role('${maria}', 'moderator')`,
      `select public.admin_set_status('${maria}', 'idle', 'AFK / Tulog')`,
      `select public.admin_revoke_sessions('${maria}')`,
      `select public.admin_ban_user('${maria}', 24, 'spam')`,
      `select public.admin_unban_user('${maria}')`,
      "select public.admin_dispatch_broadcast('Hello', 'World')",
    ]) {
      expect(await failure(db, sql)).toMatch(/NOT_AUTHORIZED/);
    }
    await asAnon(db);
    expect(await failure(db, "select public.admin_overview()")).toMatch(/permission denied/);
    expect(await failure(db, "select * from public.system_broadcasts")).toMatch(/permission denied/);
  });

  it("hides the audit log, other people's devices and account controls", async () => {
    await heartbeat(maria);
    await asUser(db, juan);
    expect(await rows(db, "select * from public.admin_audit_logs")).toHaveLength(0);
    expect(await rows(db, "select * from public.user_devices")).toHaveLength(0);
    expect(await rows(db, "select * from public.account_controls")).toHaveLength(0);
    expect(await failure(db, "insert into public.admin_audit_logs (action) values ('user.ban')")).toMatch(/permission denied/);
    expect(await failure(db, "insert into public.system_broadcasts (title, body, targets) values ('x', 'y', '{announcements}')")).toMatch(/permission denied/);
    expect(await failure(db, `insert into public.platform_admins (user_id, role) values ('${juan}', 'super_admin')`)).toMatch(/permission denied/);
    expect(await failure(db, "select public.admin_log('user.ban', null, '{}')")).toMatch(/permission denied/);
    expect(await failure(db, `select public.platform_role('${admin}')`)).toMatch(/permission denied/);
    expect((await one<{ r: string }>(db, "select public.my_platform_role() r")).r).toBe("member");
  });

  it("lets a super admin read the roster with emails, roles, sessions and devices", async () => {
    await asService(db);
    await db.query("insert into auth.sessions (user_id) values ($1), ($1)", [maria]);
    await asUser(db, admin);
    expect((await one<{ r: string }>(db, "select public.my_platform_role() r")).r).toBe("super_admin");
    const users = await rows<{ username: string; email: string; role: string; sessions: number; devices: { fingerprint: string; label: string }[] }>(
      db,
      "select username, email, role, sessions, devices from public.admin_list_users()",
    );
    expect(users.map((u) => u.username).sort()).toEqual(["juan", "maria", "pedro", "supremo"]);
    const m = users.find((u) => u.username === "maria")!;
    expect(m).toMatchObject({ email: "maria@diskarte.ph", role: "member", sessions: 2 });
    expect(m.devices).toEqual([expect.objectContaining({ fingerprint: FINGERPRINT, label: "Chrome on macOS" })]);
    expect(users.find((u) => u.username === "supremo")!.role).toBe("super_admin");
    // Server-side search by username, display name or email.
    expect((await rows(db, "select username from public.admin_list_users('MARIA@')")).map((r) => r.username)).toEqual(["maria"]);
    const overview = (await one<{ o: { users: number; online: number; super_admins: number; last7: unknown[] } }>(db, "select public.admin_overview() o")).o;
    expect(overview).toMatchObject({ users: 4, online: 1, super_admins: 1 });
    expect(overview.last7).toHaveLength(7);
  });
});

describe("roles", () => {
  it("mirrors platform roles into Diskarte HQ and logs every change", async () => {
    await asService(db);
    expect(await one(db, "select role from public.members where server_id = $1 and user_id = $2", [HQ, admin])).toEqual({ role: "admin" });

    await asUser(db, admin);
    await db.query("select public.admin_set_role($1, 'moderator')", [juan]);
    await asService(db);
    expect(await one(db, "select role from public.members where server_id = $1 and user_id = $2", [HQ, juan])).toEqual({ role: "moderator" });

    await asUser(db, admin);
    await db.query("select public.admin_set_role($1, 'super_admin')", [juan]);
    await asUser(db, juan);
    expect((await one<{ ok: boolean }>(db, "select public.is_super_admin() ok")).ok).toBe(true);
    // A promoted super admin can post in #announcements (HQ admin through the mirror).
    expect(await failure(db, "insert into public.messages (channel_id, author_id, content) values ($1, $2, 'Hello from the new admin')", [ANNOUNCEMENTS, juan])).toBeNull();

    await asUser(db, admin);
    await db.query("select public.admin_set_role($1, 'member')", [juan]);
    await asService(db);
    expect(await one(db, "select role from public.members where server_id = $1 and user_id = $2", [HQ, juan])).toEqual({ role: "member" });
    expect(await rows(db, "select 1 from public.platform_admins where user_id = $1", [juan])).toHaveLength(0);

    await asUser(db, admin);
    const log = await rows<{ action: string; details: { from: string; to: string } }>(db, "select action, details from public.admin_audit_logs where target_user_id = $1 order by created_at, details->>'to'", [juan]);
    expect(log.map((l) => `${l.details.from}->${l.details.to}`)).toEqual(expect.arrayContaining(["member->moderator", "moderator->super_admin", "super_admin->member"]));
    expect(log.every((l) => l.action === "user.role_update")).toBe(true);
  });

  it("lets a super admin delete their own account (the role mirror steps aside)", async () => {
    const leaving = await signUp(db, "leaving@diskarte.ph", { username: "leaving" });
    await asService(db);
    await db.query("insert into public.platform_admins (user_id, role) values ($1, 'super_admin')", [leaving]);
    await asUser(db, leaving);
    expect(await failure(db, "select public.delete_my_account('leaving')")).toBeNull();
    await asService(db);
    expect(await rows(db, "select 1 from public.platform_admins where user_id = $1", [leaving])).toHaveLength(0);
    expect(await rows(db, "select 1 from public.members where user_id = $1", [leaving])).toHaveLength(0);
  });

  it("rejects self-demotion and unknown roles", async () => {
    await asUser(db, admin);
    expect(await failure(db, "select public.admin_set_role($1, 'member')", [admin])).toMatch(/CANNOT_CHANGE_OWN_ROLE/);
    expect(await failure(db, "select public.admin_set_role($1, 'owner')", [maria])).toMatch(/INVALID_ROLE/);
  });
});

describe("moderation", () => {
  it("forces a status override that the person's own heartbeat picks up", async () => {
    await asUser(db, admin);
    await db.query("select public.admin_set_status($1, 'idle', 'Nagluto ng Canton')", [maria]);
    await asService(db);
    expect(await one(db, "select status, custom_status from public.profiles where id = $1", [maria])).toEqual({ status: "idle", custom_status: "Nagluto ng Canton" });
    const beat = await heartbeat(maria);
    expect(beat).toMatchObject({ signOut: false, statusOverride: { status: "idle", custom_status: "Nagluto ng Canton" } });
  });

  it("revokes sessions: auth sessions end and older tokens are told to sign out", async () => {
    const before = Math.floor(Date.now() / 1000) - 60;
    await asUser(db, admin);
    expect((await one<{ n: number }>(db, "select public.admin_revoke_sessions($1) n", [maria])).n).toBe(2);
    await asService(db);
    expect(await rows(db, "select 1 from auth.sessions where user_id = $1", [maria])).toHaveLength(0);
    expect(await rows(db, "select 1 from public.user_devices where user_id = $1", [maria])).toHaveLength(0);
    await asUserAt(maria, before);
    expect((await one<{ r: { signOut: boolean; reason: string } }>(db, "select public.heartbeat_device($1, $2, '', 'online') r", [DEVICE, FINGERPRINT])).r).toMatchObject({
      signOut: true,
      reason: "revoked",
    });
    // A fresh sign-in (newer token) is fine.
    await asUserAt(maria, Math.floor(Date.now() / 1000) + 5);
    expect((await one<{ r: { signOut: boolean } }>(db, "select public.heartbeat_device($1, $2, '', 'online') r", [DEVICE, FINGERPRINT])).r.signOut).toBe(false);
    await db.query("select set_config('request.jwt.claims', '', false)");
    await asUser(db, admin);
    expect(await failure(db, "select public.admin_revoke_sessions($1)", [admin])).toMatch(/CANNOT_REVOKE_OWN_SESSIONS/);
  });

  it("bans temporarily or permanently, blocks posting, and unbans", async () => {
    await asUser(db, admin);
    await db.query("select public.admin_ban_user($1, 24, 'Spamming the lounge')", [pedro]);
    await asService(db);
    const ctl = await one<{ banned_until: Date; ban_reason: string }>(db, "select banned_until, ban_reason from public.account_controls where user_id = $1", [pedro]);
    expect(ctl.ban_reason).toBe("Spamming the lounge");
    expect(new Date(ctl.banned_until).getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000);
    expect((await one<{ b: Date | null }>(db, "select banned_until b from auth.users where id = $1", [pedro])).b).not.toBeNull();

    await asUser(db, pedro);
    expect(await failure(db, "insert into public.messages (channel_id, author_id, content) values ($1, $2, 'still here?')", [LOUNGE, pedro])).toMatch(/row-level security/);
    expect((await heartbeat(pedro)).signOut).toBe(true);
    expect((await one<{ b: boolean }>(db, "select public.is_platform_banned() b")).b).toBe(true);
    // They can read their own ban (the app shows the reason) but nobody else's.
    expect(await rows(db, "select ban_reason from public.account_controls")).toEqual([{ ban_reason: "Spamming the lounge" }]);

    await asUser(db, admin);
    const until = (await one<{ u: string }>(db, "select public.admin_ban_user($1, null, 'Permanent') :: text u", [pedro])).u;
    expect(until).toBe("infinity");
    await db.query("select public.admin_unban_user($1)", [pedro]);
    await asUser(db, pedro);
    expect(await failure(db, "insert into public.messages (channel_id, author_id, content) values ($1, $2, 'salamat po')", [LOUNGE, pedro])).toBeNull();

    await asUser(db, admin);
    expect(await failure(db, "select public.admin_ban_user($1, 1)", [admin])).toMatch(/CANNOT_BAN_SELF/);
    expect(await failure(db, "select public.admin_ban_user($1, 0)", [maria])).toMatch(/INVALID_BAN_DURATION/);
    const actions = (await rows<{ action: string }>(db, "select action from public.admin_audit_logs where target_user_id = $1 order by created_at", [pedro])).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["user.ban", "user.unban"]));
  });

  it("never bans another super admin", async () => {
    const other = await signUp(db, "other-admin@diskarte.ph", { username: "otheradmin" });
    await asService(db);
    await db.query("insert into public.platform_admins (user_id, role) values ($1, 'super_admin')", [other]);
    await asUser(db, admin);
    expect(await failure(db, "select public.admin_ban_user($1, 24)", [other])).toMatch(/CANNOT_BAN_SUPER_ADMIN/);
  });
});

describe("broadcasts", () => {
  it("posts to the chosen HQ channels, records the broadcast and pins a sticky banner", async () => {
    await asUser(db, admin);
    const id = (await one<{ id: string }>(db, "select public.admin_dispatch_broadcast('v2.0 is live', $1, 'success', array['announcements', 'global-lounge'], true, 48) id", [
      "> [!SUCCESS]\n> The Control Center has landed.\n\n```ts\nconst ok = true;\n```",
    ])).id;

    await asUser(db, maria);
    const b = await one<{ title: string; tone: string; targets: string[]; sticky: boolean; sticky_until: Date; message_ids: string[] }>(
      db,
      "select title, tone, targets, sticky, sticky_until, message_ids from public.system_broadcasts where id = $1",
      [id],
    );
    expect(b).toMatchObject({ title: "v2.0 is live", tone: "success", targets: ["announcements", "global-lounge"], sticky: true });
    expect(b.message_ids).toHaveLength(2);
    expect(new Date(b.sticky_until).getTime()).toBeGreaterThan(Date.now() + 47 * 3600_000);
    const posted = await rows<{ channel_id: string; author_id: string; content: string }>(db, "select channel_id, author_id, content from public.messages where id = any($1::uuid[]) order by channel_id", [b.message_ids]);
    expect(posted.map((m) => m.channel_id)).toEqual([ANNOUNCEMENTS, LOUNGE]);
    expect(posted.every((m) => m.author_id === admin && m.content.startsWith("## v2.0 is live\n\n> [!SUCCESS]"))).toBe(true);

    await asUser(db, admin);
    await db.query("select public.admin_retract_broadcast($1)", [id]);
    expect(await failure(db, "select public.admin_retract_broadcast($1)", [id])).toMatch(/BROADCAST_NOT_FOUND/);
    await asUser(db, maria);
    expect((await one<{ r: Date | null }>(db, "select retracted_at r from public.system_broadcasts where id = $1", [id])).r).not.toBeNull();
  });

  it("validates titles, bodies, tones, targets and sticky durations", async () => {
    await asUser(db, admin);
    expect(await failure(db, "select public.admin_dispatch_broadcast('', 'body')")).toMatch(/INVALID_TITLE/);
    expect(await failure(db, "select public.admin_dispatch_broadcast('t', '   ')")).toMatch(/INVALID_BODY/);
    expect(await failure(db, "select public.admin_dispatch_broadcast('t', 'b', 'party')")).toMatch(/INVALID_TONE/);
    expect(await failure(db, "select public.admin_dispatch_broadcast('t', 'b', 'info', array['general'])")).toMatch(/INVALID_TARGETS/);
    expect(await failure(db, "select public.admin_dispatch_broadcast('t', 'b', 'info', array['announcements'], true, 9999)")).toMatch(/INVALID_STICKY_DURATION/);
  });
});

describe("realtime topics", () => {
  const allowed = async (topic: string) => (await one<{ ok: boolean }>(db, "select public.can_access_realtime_topic($1) as ok", [topic])).ok;

  it("authorises broadcasts for everyone, the admin feed for super admins and each account's own controls", async () => {
    await asUser(db, maria);
    expect(await allowed(`db:broadcasts:${HQ}`)).toBe(true);
    expect(await allowed(`db:broadcasts:${maria}`)).toBe(false);
    expect(await allowed(`db:account:${maria}`)).toBe(true);
    expect(await allowed(`db:account:${admin}`)).toBe(false);
    expect(await allowed(`db:admin:${maria}`)).toBe(false);
    await asUser(db, admin);
    expect(await allowed(`db:admin:${admin}`)).toBe(true);
    expect(await allowed(`db:admin:${maria}`)).toBe(false);
  });
});
