import { describe, expect, it } from "vitest";
import { formatTimestamp, isGroupedWithPrevious } from "@/lib/chat-format";
import { cleanMessageContent, messageContentSchema, type MessageWithAuthor } from "@/lib/messages";
import { flattenPresence, signalLevel, visibleStatus } from "@/lib/presence";
import { presenceFor } from "../../../tests/fixtures/server";

describe("presence", () => {
  it("collapses multiple tabs, preferring the one in voice", () => {
    const flat = flattenPresence({
      a: [presenceFor("u1", { online_at: "2026-09-26T10:00:00Z" }), presenceFor("u1", { voice_channel_id: "v1", online_at: "2026-09-26T09:00:00Z" })],
      b: [presenceFor("u2", { online_at: "2026-09-26T09:00:00Z" }), presenceFor("u2", { status: "idle", online_at: "2026-09-26T11:00:00Z" })],
    });
    expect(flat.get("u1")?.voice_channel_id).toBe("v1");
    expect(flat.get("u2")?.status).toBe("idle");
  });

  it("hides invisible users", () => {
    expect(visibleStatus(presenceFor("u", { status: "invisible" }))).toBe("offline");
    expect(visibleStatus(undefined)).toBe("offline");
    expect(visibleStatus(presenceFor("u", { status: "dnd" }))).toBe("dnd");
  });

  it("maps realtime health to arcade signal bars", () => {
    expect(signalLevel("connected", true)).toBe(4);
    expect(signalLevel("connecting", true)).toBe(2);
    expect(signalLevel("degraded", true)).toBe(1);
    expect(signalLevel("connected", false)).toBe(0);
  });
});

const msg = (id: string, author: string | null, at: string, extra: Partial<MessageWithAuthor> = {}): MessageWithAuthor => ({
  id,
  channel_id: "c",
  server_id: "s",
  author_id: author,
  content: "hi",
  attachments: [],
  reply_to_id: null,
  pinned: false,
  pinned_at: null,
  pinned_by: null,
  edited_at: null,
  thread_id: null,
  sticker: null,
  thread_reply_count: 0,
  thread_last_reply_at: null,
  created_at: at,
  author: null,
  ...extra,
});

describe("chat formatting", () => {
  it("groups consecutive messages from the same author within 7 minutes", () => {
    const a = msg("1", "u1", "2026-09-26T10:00:00Z");
    expect(isGroupedWithPrevious(a, msg("2", "u1", "2026-09-26T10:05:00Z"))).toBe(true);
    expect(isGroupedWithPrevious(a, msg("3", "u1", "2026-09-26T10:08:00Z"))).toBe(false);
    expect(isGroupedWithPrevious(a, msg("4", "u2", "2026-09-26T10:01:00Z"))).toBe(false);
    expect(isGroupedWithPrevious(a, msg("5", "u1", "2026-09-26T10:01:00Z", { reply_to_id: "1" }))).toBe(false);
    expect(isGroupedWithPrevious(undefined, a)).toBe(false);
  });

  it("formats relative day labels in a fixed timezone", () => {
    const now = new Date("2026-09-26T04:00:00Z"); // 12:00 in Manila
    expect(formatTimestamp("2026-09-26T01:30:00Z", now, "Asia/Manila")).toBe("Today 9:30 AM");
    expect(formatTimestamp("2026-09-25T01:30:00Z", now, "Asia/Manila")).toMatch(/^Yesterday 9:30/);
    expect(formatTimestamp("2026-01-02T01:30:00Z", now, "Asia/Manila")).toMatch(/January 2, 2026/);
    // 23:30 UTC on the 25th is already the 26th in Manila.
    expect(formatTimestamp("2026-09-25T23:30:00Z", now, "Asia/Manila")).toMatch(/^Today 7:30/);
  });
});

describe("message content", () => {
  it("strips control and zero-width characters but keeps newlines", () => {
    expect(cleanMessageContent("  hi\r\nthere\u0000​  ")).toBe("hi\nthere");
  });
  it("caps the length", () => {
    expect(messageContentSchema.safeParse("x".repeat(4001)).success).toBe(false);
  });
});
