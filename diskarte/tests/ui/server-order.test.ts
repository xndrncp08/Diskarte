import { describe, expect, it } from "vitest";
import { sortByOrder } from "@/components/shell/ServerRail";

describe("sortByOrder", () => {
  it("puts saved ids in saved order and keeps unknown servers after them in their original order", () => {
    expect(sortByOrder(["a", "b", "c", "d"], "c,a,gone")).toEqual(["c", "a", "b", "d"]);
  });
  it("keeps the original order when nothing is saved", () => {
    expect(sortByOrder(["a", "b"], "")).toEqual(["a", "b"]);
  });
});
