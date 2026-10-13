import { beforeEach, describe, expect, it } from "vitest";
import { lastChannelIn, readLastChannels, rememberChannel } from "@/lib/last-channel";

describe("last channel per server", () => {
  beforeEach(() => localStorage.clear());

  it("remembers the channel per server and ignores corrupt storage", () => {
    rememberChannel("s1", "c1");
    rememberChannel("s2", "c9");
    rememberChannel("s1", "c2");
    expect(lastChannelIn(readLastChannels(), "s1")).toBe("c2");
    expect(lastChannelIn(readLastChannels(), "s2")).toBe("c9");
    expect(lastChannelIn("{not json", "s1")).toBeUndefined();
    localStorage.setItem("diskarte:last-channel", "{not json");
    rememberChannel("s3", "c3");
    expect(lastChannelIn(readLastChannels(), "s3")).toBe("c3");
  });
});
