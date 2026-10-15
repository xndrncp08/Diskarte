import { act, cleanup, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../../../tests/fixtures/fake-supabase";
import type { Json, Tables } from "@/lib/supabase/database.types";
const tables: Record<string, unknown[]> = {};
const fake = createFakeSupabase(tables);
vi.mock("@/components/providers/RuntimeConfig", () => ({ useOptionalSupabase: () => fake.client }));
const { useAccountSync } = await import("../useAccountSync");
const user = "00000000-0000-4000-8000-000000000001", key = "draft:20000000-0000-4000-8000-000000000001:main";
const row = (value: string, revision = 1): Tables<"account_state"> => ({ user_id: user, key, value, revision, updated_at: "2026-10-14T00:00:00Z" });
beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear(); tables.account_state = [];
  fake.client.rpc.mockClear();
  fake.client.rpc.mockImplementation(async (...args: unknown[]) => {
    const input = args[1] as { p_key: string; p_value: string; p_revision: number };
    const existing = tables.account_state[0] as Tables<"account_state"> | undefined;
    if ((existing?.revision ?? 0) !== input.p_revision) return { data: null, error: { code: "40001" } } as never;
    const next = row(input.p_value, input.p_revision + 1); tables.account_state = [next];
    return { data: [next], error: null } as never;
  });
});
afterEach(async () => { cleanup(); await vi.advanceTimersByTimeAsync(40); vi.useRealTimers(); });
const settle = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
function useTestSync(initial = "") {
  const [value, setValue] = useState<Json>(initial);
  return { value, setValue, sync: useAccountSync(user, key, value, setValue) };
}
describe("cross-device state sync", () => {
  it("does not treat reordered jsonb object keys as edits or create sync loops", async () => {
    const preference = { user_id: user, key: "prefs:display", value: { b: true, a: { y: 2, x: 1 } }, revision: 1, updated_at: "2026-10-14T00:00:00Z" };
    tables.account_state = [preference];
    const hook = renderHook(() => {
      const [value, setValue] = useState<Json>({ a: { x: 1, y: 2 }, b: true });
      return useAccountSync(user, "prefs:display", value, setValue);
    });
    await settle(2000);
    expect(fake.client.rpc).not.toHaveBeenCalled();
    expect(hook.result.current.conflict).toBeNull();
    act(() => fake.emitDb("account_state", "UPDATE", { ...preference, revision: 2, value: { a: { y: 2, x: 1 }, b: true } }));
    await settle(2000);
    expect(fake.client.rpc).not.toHaveBeenCalled();
    expect(hook.result.current.conflict).toBeNull();
  });
  it("restores an account draft and synchronizes clearing it after sending", async () => {
    tables.account_state = [row("From my phone")];
    const hook = renderHook(() => useTestSync()); await settle();
    expect(hook.result.current.value).toBe("From my phone");
    act(() => hook.result.current.setValue("")); await settle(800);
    expect(tables.account_state[0]).toMatchObject({ value: "", revision: 2 });
    expect(fake.client.rpc).toHaveBeenCalledOnce();
  });
  it("preserves divergent offline edits until the user explicitly chooses a version", async () => {
    tables.account_state = [row("Other device")];
    const hook = renderHook(() => useTestSync("Unsaved local text")); await settle(1000);
    expect(hook.result.current.value).toBe("Unsaved local text");
    expect(hook.result.current.sync.conflict?.value).toBe("Other device");
    expect(fake.client.rpc).not.toHaveBeenCalled();
    act(() => hook.result.current.sync.keepLocal()); await settle(800);
    expect(tables.account_state[0]).toMatchObject({ value: "Unsaved local text", revision: 2 });
  });
  it("reconciles incoming revisions without overwriting local typing", async () => {
    tables.account_state = [row("Original")];
    const hook = renderHook(() => useTestSync()); await settle();
    act(() => hook.result.current.setValue("Typing here"));
    act(() => fake.emitDb("account_state", "UPDATE", row("Typing elsewhere", 2)));
    expect(hook.result.current.sync.conflict?.value).toBe("Typing elsewhere");
    await settle(1000); expect(fake.client.rpc).not.toHaveBeenCalled();
    act(() => hook.result.current.sync.useRemote());
    expect(hook.result.current.value).toBe("Typing elsewhere");
  });
  it("does not repeatedly retry a failed write or expose content in its error", async () => {
    tables.account_state = [row("Original")];
    const hook = renderHook(() => useTestSync()); await settle();
    fake.client.rpc.mockRejectedValue(new TypeError("private credentials and message text"));
    act(() => hook.result.current.setValue("Keep this")); await settle(5000);
    expect(fake.client.rpc).toHaveBeenCalledOnce();
    expect(hook.result.current.value).toBe("Keep this");
    expect(hook.result.current.sync.problem).toContain("preserved");
    expect(hook.result.current.sync.problem).not.toContain("credentials");
  });
});
