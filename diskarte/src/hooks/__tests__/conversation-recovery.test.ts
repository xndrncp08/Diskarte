import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { createFakeSupabase } from "../../../tests/fixtures/fake-supabase";
import type { ChatMessage } from "../useChannelChat";
import { reconcileHistory, useConversationRecovery } from "../useConversationRecovery";
const tables: Record<string, unknown[]> = {};
const fake = createFakeSupabase(tables);
const read = fake.client.from.getMockImplementation()! as (table: string) => ReturnType<typeof fake.client.from>;
beforeEach(() => { fake.client.from.mockImplementation(read); });
vi.mock("@/components/providers/RuntimeConfig", () => ({ useSupabase: () => fake.client }));
const row = (id: string, content = id) => ({ id, content, created_at: "2026-10-14T00:00:00Z" }) as ChatMessage;
describe("reconnect reconciliation", () => {
  it("discards a delayed fetch after navigation and lets the new conversation recover immediately", async () => {
    tables.messages = [
      { ...row("old-message"), channel_id: "old", thread_id: null },
      { ...row("new-message"), channel_id: "new", thread_id: null },
    ];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let first = true;
    fake.client.from.mockImplementation((table) => {
      const query = read(table);
      if (first && table === "messages") {
        first = false;
        const then = query.then;
        query.then = (resolve) => gate.then(() => then(resolve));
      }
      return query;
    });
    const hook = renderHook(({ target }) => {
      const [messages, setMessages] = useState<ChatMessage[]>([]);
      return { messages, recovery: useConversationRecovery(target, "channel", messages, setMessages) };
    }, { initialProps: { target: "old" } });
    let request!: Promise<void>;
    await act(async () => { request = hook.result.current.recovery.recover(); });
    hook.rerender({ target: "new" });
    await act(async () => { await hook.result.current.recovery.recover(); });
    expect(hook.result.current.messages.map((m) => m.id)).toEqual(["new-message"]);
    await act(async () => { release(); await request; });
    expect(hook.result.current.messages.map((m) => m.id)).toEqual(["new-message"]);
    expect(hook.result.current.recovery.problem).toBe(false);
  });
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
