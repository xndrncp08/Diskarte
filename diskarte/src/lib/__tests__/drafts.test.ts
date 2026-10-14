import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearDrafts, useDraft } from "../drafts";

beforeEach(() => { localStorage.clear(); clearDrafts(); });
afterEach(clearDrafts);
describe("draft persistence", () => {
  it("restores on return and isolates accounts, channels and threads", () => {
    const first = renderHook(() => useDraft("juan", "general:main"));
    act(() => first.result.current[1]("Kumusta")); first.unmount();
    expect(localStorage.getItem("diskarte:draft:juan:general:main")).toBe("Kumusta");
    const returned = renderHook(() => useDraft("juan", "general:main"));
    expect(returned.result.current[0]).toBe("Kumusta");
    expect(renderHook(() => useDraft("maria", "general:main")).result.current[0]).toBe("");
    expect(renderHook(() => useDraft("juan", "general:thread-id")).result.current[0]).toBe("");
    act(() => returned.result.current[1]("")); returned.unmount();
    expect(localStorage.getItem("diskarte:draft:juan:general:main")).toBeNull();
  });
  it("clears memory and disk on sign-out", () => {
    const hook = renderHook(() => useDraft("juan", "general:main"));
    act(() => hook.result.current[1]("private draft"));
    act(clearDrafts);
    expect(hook.result.current[0]).toBe("");
    hook.unmount();
    expect(localStorage.getItem("diskarte:draft:juan:general:main")).toBeNull();
  });
});
