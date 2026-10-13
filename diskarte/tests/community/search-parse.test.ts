import { describe, expect, it } from "vitest";
import { parseSearch } from "@/lib/search";

describe("search syntax", () => {
  it("pulls out from: and in: and keeps the words", () => {
    expect(parseSearch("adobo from:Juan in:#general")).toEqual({ text: "adobo", from: "juan", in: "general" });
    expect(parseSearch("  from:@maria.c  ")).toEqual({ text: "", from: "maria.c", in: null });
    expect(parseSearch("laro tayo")).toEqual({ text: "laro tayo", from: null, in: null });
  });
});
