import { describe, expect, it } from "vitest";
import { createOnce } from "@/lib/once";

describe("createOnce", () => {
  it("lets each id through once and forgets the oldest past its limit", () => {
    const once = createOnce(2);
    expect([once("a"), once("a"), once("b"), once("c")]).toEqual([true, false, true, true]);
    expect(once("a")).toBe(true);
    expect(once("c")).toBe(false);
  });
});
