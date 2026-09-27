// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { limiters } from "@/lib/rate-limit";

const USER = "00000000-0000-4000-8000-0000000000aa";
const SERVER = "10000000-0000-4000-8000-000000000001";
const OTHER_SERVER = "10000000-0000-4000-8000-000000000002";
const CHANNEL = "20000000-0000-4000-8000-000000000001";
const TARGET = "00000000-0000-4000-8000-0000000000bb";
const MSG = "30000000-0000-4000-8000-000000000001";

type Result = { data: unknown; error: { message: string; code?: string; details?: string } | null };

/** Records every query and answers from per-test scripts. */
const db = {
  calls: [] as { table?: string; rpc?: string; op: string; args: unknown[] }[],
  rpcResult: (() => ({ data: null, error: null })) as (name: string, args: unknown) => Result,
  tableResult: (() => ({ data: null, error: null })) as (table: string, ops: string[]) => Result,
  removed: [] as string[][],
};

function builder(table: string) {
  const ops: string[] = [];
  const api: Record<string, unknown> = {};
  for (const op of ["select", "insert", "update", "upsert", "delete", "eq", "neq", "in", "is", "lt", "gt", "order", "limit", "like"]) {
    api[op] = (...args: unknown[]) => {
      ops.push(op);
      db.calls.push({ table, op, args });
      return api;
    };
  }
  const settle = () => Promise.resolve(db.tableResult(table, ops));
  api.single = settle;
  api.maybeSingle = settle;
  api.then = (resolve: (v: Result) => unknown, reject: (e: unknown) => unknown) => settle().then(resolve, reject);
  return api;
}

vi.mock("@/lib/auth", () => ({ getSessionUser: async () => ({ id: USER }) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (name: string, args: unknown) => {
      db.calls.push({ rpc: name, op: "rpc", args: [args] });
      return db.rpcResult(name, args);
    },
    from: (table: string) => builder(table),
    storage: { from: () => ({ remove: async (paths: string[]) => (db.removed.push(paths), { data: null, error: null }) }) },
  }),
}));

const moderation = await import("@/actions/moderation");
const lfg = await import("@/actions/lfg");
const social = await import("@/actions/social");
const messages = await import("@/actions/messages");
const servers = await import("@/actions/servers");

const rpcCall = (name: string) => db.calls.find((c) => c.rpc === name)?.args[0];
const tableCall = (table: string, op: string) => db.calls.find((c) => c.table === table && c.op === op)?.args[0];

beforeEach(() => {
  db.calls = [];
  db.removed = [];
  db.rpcResult = () => ({ data: null, error: null });
  db.tableResult = () => ({ data: [{ id: "x" }], error: null });
  for (const l of Object.values(limiters)) l.reset();
});

describe("moderation actions", () => {
  it("saves auto-mod settings normalised, and rejects unknown categories", async () => {
    expect(await moderation.updateAutomodAction({ serverId: SERVER, enabled: true, categories: ["spam", "phishing"], customTerms: [" Scam ", "scam", "Benta"] })).toMatchObject({ ok: true });
    expect(tableCall("servers", "update")).toEqual({ automod_enabled: true, automod_categories: ["spam", "phishing"], automod_custom_terms: ["scam", "benta"] });
    expect((await moderation.updateAutomodAction({ serverId: SERVER, enabled: true, categories: ["gore"], customTerms: [] })).ok).toBe(false);
  });

  it("reports RLS refusals (non-admins) as a friendly error", async () => {
    db.tableResult = () => ({ data: [], error: null });
    const result = await moderation.updateSupportAction({ serverId: SERVER, gcashNumber: "0917 123 4567", mayaNumber: "", supportNote: "" });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/Admins/) });
    expect(tableCall("servers", "update")).toMatchObject({ gcash_number: "09171234567", maya_number: null });
  });

  it("bans through the RPC with a trimmed reason and maps hierarchy errors", async () => {
    expect(await moderation.banMemberAction({ serverId: SERVER, userId: TARGET, reason: "  spam links  " })).toEqual({ ok: true });
    expect(rpcCall("ban_member")).toEqual({ p_server_id: SERVER, p_user_id: TARGET, p_reason: "spam links" });
    db.rpcResult = () => ({ data: null, error: { message: "CANNOT_BAN_MEMBER" } });
    expect(await moderation.banMemberAction({ serverId: SERVER, userId: TARGET })).toMatchObject({ ok: false, error: expect.stringMatching(/i-ban/) });
    expect((await moderation.banMemberAction({ serverId: "nope", userId: TARGET })).ok).toBe(false);
  });

  it("grants with an idempotent upsert and revokes with a delete", async () => {
    await moderation.setBadgeAction({ serverId: SERVER, userId: TARGET, badge: "booster", on: true });
    expect(tableCall("server_badges", "upsert")).toEqual({ server_id: SERVER, user_id: TARGET, badge: "booster" });
    await moderation.setBadgeAction({ serverId: SERVER, userId: TARGET, badge: "booster", on: false });
    expect(db.calls.some((c) => c.table === "server_badges" && c.op === "delete")).toBe(true);
    expect((await moderation.setBadgeAction({ serverId: SERVER, userId: TARGET, badge: "vip", on: true })).ok).toBe(false);
  });

  it("only registers soundboard clips stored under the same server, cleaning up failures", async () => {
    const path = `${OTHER_SERVER}/00000000-0000-4000-8000-000000000123.mp3`;
    expect(await moderation.addSoundboardClipAction({ serverId: SERVER, name: "Awit", emoji: "", path })).toMatchObject({ ok: false });
    expect(db.calls.some((c) => c.table === "soundboard_clips")).toBe(false);

    const good = `${SERVER}/00000000-0000-4000-8000-000000000123.mp3`;
    db.tableResult = () => ({ data: null, error: { message: "SOUNDBOARD_FULL" } });
    expect(await moderation.addSoundboardClipAction({ serverId: SERVER, name: "Awit", emoji: "", path: good })).toMatchObject({ ok: false, error: expect.stringMatching(/24/) });
    expect(db.removed).toEqual([[good]]);
    expect(tableCall("soundboard_clips", "insert")).toMatchObject({ emoji: "🔊", storage_path: good });
  });
});

describe("LFG actions", () => {
  it("creates beacons through the RPC", async () => {
    db.rpcResult = () => ({ data: "beacon-1", error: null });
    const result = await lfg.createLfgAction({ serverId: SERVER, game: "Valorant", description: "Gold+", partySize: 5, durationMinutes: 60, voiceChannelId: CHANNEL });
    expect(result).toEqual({ ok: true, data: { beaconId: "beacon-1" } });
    expect(rpcCall("create_lfg")).toEqual({ p_server_id: SERVER, p_game: "Valorant", p_description: "Gold+", p_party_size: 5, p_voice_channel_id: CHANNEL, p_duration_minutes: 60 });
    expect((await lfg.createLfgAction({ serverId: SERVER, game: "", description: "", partySize: 20, durationMinutes: 60, voiceChannelId: "" })).fieldErrors).toBeTruthy();
  });

  it("joins in one click, returning the voice channel, and explains full parties", async () => {
    db.rpcResult = () => ({ data: CHANNEL, error: null });
    expect(await lfg.joinLfgAction({ beaconId: MSG })).toEqual({ ok: true, data: { voiceChannelId: CHANNEL } });
    db.rpcResult = () => ({ data: null, error: { message: "LFG_FULL" } });
    expect(await lfg.joinLfgAction({ beaconId: MSG })).toMatchObject({ ok: false, error: "Puno na ang party!" });
  });
});

describe("social actions", () => {
  it("sends friend requests by @username", async () => {
    db.rpcResult = () => ({ data: "pending", error: null });
    expect(await social.sendFriendRequestAction({ username: " @Juan.Tamad " })).toEqual({ ok: true, data: { status: "pending" } });
    expect(rpcCall("send_friend_request")).toEqual({ p_username: "juan.tamad" });
    expect((await social.sendFriendRequestAction({ username: "no spaces!" })).fieldErrors?.username).toBeTruthy();
    db.rpcResult = () => ({ data: null, error: { message: "USER_NOT_FOUND" } });
    expect((await social.sendFriendRequestAction({ username: "ghost" })).fieldErrors?.username).toMatch(/Walang user/);
  });

  it("validates group DM size before calling the database", async () => {
    expect(await social.createGroupDmAction({ userIds: [TARGET], name: "" })).toMatchObject({ ok: false, error: expect.stringMatching(/2 friends/) });
    expect(db.calls).toHaveLength(0);
    db.rpcResult = () => ({ data: "conv-1", error: null });
    expect(await social.createGroupDmAction({ userIds: [TARGET, USER.replace("aa", "cc")], name: " Squad " })).toEqual({ ok: true, data: { conversationId: "conv-1" } });
    expect(rpcCall("create_group_dm")).toMatchObject({ p_name: "Squad" });
  });

  it("sends DMs, treating a duplicate id as already delivered and surfacing privacy refusals", async () => {
    const row = { id: MSG, conversation_id: CHANNEL, author_id: USER, content: "uy", sticker: null, reply_to_id: null, edited_at: null, created_at: "2026-09-27T00:00:00Z" };
    db.tableResult = (_t, ops) => (ops.includes("insert") ? { data: null, error: { message: "duplicate key", code: "23505" } } : { data: row, error: null });
    expect(await social.sendDirectMessageAction({ id: MSG, conversationId: CHANNEL, content: "uy" })).toEqual({ ok: true, data: { message: row } });
    db.tableResult = () => ({ data: null, error: { message: "DM_NOT_ALLOWED" } });
    expect(await social.sendDirectMessageAction({ id: MSG, conversationId: CHANNEL, content: "uy" })).toMatchObject({ ok: false, code: "DM_NOT_ALLOWED" });
    expect((await social.sendDirectMessageAction({ id: MSG, conversationId: CHANNEL, content: "", sticker: "not-a-sticker" })).ok).toBe(false);
  });
});

describe("channel message actions (community additions)", () => {
  const send = (extra: Record<string, unknown> = {}) => messages.sendMessageAction({ id: MSG, channelId: CHANNEL, content: "hello", ...extra });

  it("passes thread and sticker through", async () => {
    db.tableResult = () => ({ data: [{ id: MSG }], error: null });
    expect((await send({ content: "", sticker: "sana-all", threadId: MSG.replace("1", "2") })).ok).toBe(true);
    expect(tableCall("messages", "insert")).toMatchObject({ content: "", sticker: "sana-all", thread_id: MSG.replace("1", "2") });
    expect((await send({ content: "", sticker: "unknown" })).ok).toBe(false);
  });

  it("reports slow mode with a retry time", async () => {
    db.tableResult = () => ({ data: null, error: { message: "SLOWMODE", details: "12" } });
    expect(await send()).toMatchObject({ ok: false, code: "SLOWMODE", retryAfter: 12 });
  });

  it("detects auto-mod drops (insert returned no row) and verification gates", async () => {
    // The trigger returns NULL: the insert commits (keeping the audit entry) and yields no rows.
    db.tableResult = () => ({ data: [], error: null });
    expect(await send()).toMatchObject({ ok: false, code: "AUTOMOD_BLOCKED", error: expect.stringMatching(/Bantay-Bayan/) });
    expect(db.calls.some((c) => c.table === "messages" && c.op === "insert")).toBe(true);
    db.tableResult = () => ({ data: null, error: { message: "VERIFICATION_REQUIRED" } });
    expect(await send()).toMatchObject({ ok: false, code: "VERIFICATION_REQUIRED" });
  });

  it("stores slow mode and verification settings on channels", async () => {
    await servers.updateChannelAction({ channelId: CHANNEL, name: "general", type: "text", category: "Text", topic: "", slowmodeSeconds: 30, requiresVerification: true });
    expect(tableCall("channels", "update")).toMatchObject({ slowmode_seconds: 30, requires_verification: true });
    expect((await servers.updateChannelAction({ channelId: CHANNEL, name: "general", type: "text", category: "Text", topic: "", slowmodeSeconds: 99999 })).ok).toBe(false);
  });
});
