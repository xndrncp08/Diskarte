import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeNotifications, flushReads, notificationTag, pendingReads, queueRead } from "@/lib/read-receipts";

type Result = { error: { message?: string; code?: string } | null };
function client(answers: Record<string, Result | (() => Result)>) {
  const calls: [string, Record<string, unknown>][] = [];
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    calls.push([fn, args]);
    const a = answers[fn] ?? { error: null };
    return typeof a === "function" ? a() : a;
  });
  return { supabase: { rpc } as never, calls };
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("read receipts", () => {
  it("keeps the latest mark per conversation until the server confirms it", async () => {
    queueRead("channel", "c1", "2026-10-15T10:00:00.000Z");
    queueRead("channel", "c1", "2026-10-15T09:00:00.000Z");
    queueRead("dm", "d1", "2026-10-15T10:05:00.000Z");
    expect(pendingReads()).toEqual({ "channel:c1": "2026-10-15T10:00:00.000Z", "dm:d1": "2026-10-15T10:05:00.000Z" });
    const { supabase, calls } = client({});
    await flushReads(supabase);
    expect(calls).toEqual([
      ["mark_channel_read_until", { p_channel: "c1", p_at: "2026-10-15T10:00:00.000Z" }],
      ["mark_dm_read_until", { p_conversation_id: "d1", p_at: "2026-10-15T10:05:00.000Z" }],
    ]);
    expect(pendingReads()).toEqual({});
  });

  it("keeps a receipt that failed (offline, server error) for the next flush", async () => {
    queueRead("channel", "c1", "2026-10-15T10:00:00.000Z");
    await flushReads(client({ mark_channel_read_until: { error: { message: "Failed to fetch" } } }).supabase);
    expect(pendingReads()).toEqual({ "channel:c1": "2026-10-15T10:00:00.000Z" });
    await flushReads(client({}).supabase);
    expect(pendingReads()).toEqual({});
  });

  it("falls back to the older receipt functions on a database without the new ones", async () => {
    queueRead("dm", "d1", "2026-10-15T10:00:00.000Z");
    const { supabase, calls } = client({ mark_dm_read_until: { error: { code: "PGRST202", message: "Could not find the function public.mark_dm_read_until" } } });
    await flushReads(supabase);
    expect(calls.map(([fn]) => fn)).toEqual(["mark_dm_read_until", "mark_dm_read"]);
    expect(pendingReads()).toEqual({});
  });

  it("closes alerts already shown for a conversation once it's read", async () => {
    const close = vi.fn();
    const getNotifications = vi.fn(async () => [{ close }]);
    vi.stubGlobal("navigator", { serviceWorker: { getRegistration: async () => ({ getNotifications }) } });
    closeNotifications(notificationTag("dm", "d1"));
    await vi.waitFor(() => expect(close).toHaveBeenCalled());
    expect(getNotifications).toHaveBeenCalledWith({ tag: "dm:d1" });
    expect(notificationTag("channel", "c9")).toBe("channel:c9");
  });

  it("still sends after a flush that found nothing to send", async () => {
    const { supabase, calls } = client({});
    await flushReads(supabase);
    queueRead("channel", "c2", "2026-10-15T11:00:00.000Z");
    await flushReads(supabase);
    expect(calls.map(([fn]) => fn)).toEqual(["mark_channel_read_until"]);
  });
});
