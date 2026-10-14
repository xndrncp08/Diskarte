import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { createFakeSupabase } from "../../../tests/fixtures/fake-supabase";
import type { ChatMessage } from "../useChannelChat";
import { reconcileHistory, useConversationRecovery } from "../useConversationRecovery";
const tables: Record<string, unknown[]> = {};
const fake = createFakeSupabase(tables);
vi.mock("@/components/providers/RuntimeConfig", () => ({ useSupabase: () => fake.client }));
const row = (id: string, content = id) => ({ id, content, created_at: "2026-10-14T00:00:00Z" }) as ChatMessage;
describe("reconnect reconciliation", () => {
  it("loads multiple missed pages and reconciles edits and deletions through the real hook", async () => {
    const message = (index: number, content = "hello") => ({ ...row(`m${String(index).padStart(4, "0")}`, content), channel_id: "channel", thread_id: null, author: null, author_id: null, created_at: new Date(Date.UTC(2026, 9, 14, 0, 0, index)).toISOString() });
    tables.messages = [message(0, "edited while offline"), ...Array.from({ length: 235 }, (_, index) => message(index + 2))];
    const hook = renderHook(() => {
      const [messages, setMessages] = useState<ChatMessage[]>([message(0), message(1, "deleted while offline")]);
      const recovery = useConversationRecovery("channel", "channel", messages, setMessages);
      return { messages, recovery };
    });
    await act(async () => { await hook.result.current.recovery.recover(); });
    expect(hook.result.current.recovery.problem).toBe(false);
    expect(hook.result.current.messages).toHaveLength(236);
    expect(hook.result.current.messages[0].content).toBe("edited while offline");
    expect(hook.result.current.messages.some((m) => m.id === "m0001")).toBe(false);
    expect(new Set(hook.result.current.messages.map((m) => m.id)).size).toBe(236);
  });
  it("fills missed inserts, updates and deletes without duplicating rows", () => {
    const a = row("a"), b = row("b"), c = row("c");
    const next = reconcileHistory([a, b], [a, b], [row("a", "edited"), c, c], new Set());
    expect(next.map((m) => [m.id, m.content])).toEqual([["a", "edited"], ["c", "c"]]);
  });
  it("preserves concurrent live edits, new incoming rows and queued sends", () => {
    const a = row("a"), b = row("b"), changed = row("a", "live edit"), live = row("live"), queued = { ...row("q"), queued: true };
    const result = reconcileHistory([changed, live, queued], [a, b], [row("a", "stale"), b], new Set(["b"]));
    expect(result.map((m) => m.id)).toEqual(["a", "live", "q"]);
    expect(result[0].content).toBe("live edit");
  });
});
