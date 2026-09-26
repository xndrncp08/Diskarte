import { describe, expect, it } from "vitest";
import { cn, formatBytes, initials } from "@/lib/utils";

describe("utils", () => {
  it("merges tailwind classes, last one wins", () => {
    expect(cn("px-2 text-sm", false && "hidden", "px-4")).toBe("text-sm px-4");
  });

  it("builds initials", () => {
    expect(initials("Juan dela Cruz")).toBe("JC");
    expect(initials("maria")).toBe("MA");
    expect(initials("   ")).toBe("?");
  });

  it("formats byte sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(25 * 1024 * 1024)).toBe("25 MB");
    expect(formatBytes(-1)).toBe("0 B");
  });
});
