import { describe, expect, it } from "vitest";
import { canManageMember, inviteExpiry, isTimedOut, firstTextChannel, groupChannels, hasRole, inviteUrl, parseInviteInput, serverInitials, slugifyChannelName } from "@/lib/servers";
import { channelSchema, serverSchema } from "@/lib/schemas/servers";
import { channels, makeChannel } from "../../../tests/fixtures/server";

describe("slugifyChannelName", () => {
  it.each([
    ["LFG Valorant!!", "lfg-valorant"],
    ["  Chika  Time ", "chika-time"],
    ["Pañuelo", "panuelo"],
    ["--memes--", "memes-"],
    ["🔥🔥", ""],
  ])("%s → %s", (input, output) => {
    expect(slugifyChannelName(input)).toBe(output);
  });

  it("caps length at 32", () => {
    expect(slugifyChannelName("a".repeat(50))).toHaveLength(32);
  });
});

describe("parseInviteInput", () => {
  it("accepts bare codes in any case", () => {
    expect(parseInviteInput(" abcdefgh23 ")).toBe("ABCDEFGH23");
  });
  it("extracts codes from invite links", () => {
    expect(parseInviteInput("https://diskarte.onrender.com/invite/ABCDEFGH23")).toBe("ABCDEFGH23");
    expect(parseInviteInput("https://x.ph/invite/abcdefgh23/?ref=fb")).toBe("ABCDEFGH23");
  });
  it("rejects malformed codes (including look-alike characters)", () => {
    for (const bad of ["", "SHORT", "ABCDEFGH2O", "ABCDEFGH21", "https://evil.example/ABCDEFGH23x"]) expect(parseInviteInput(bad)).toBeNull();
  });
  it("builds invite URLs", () => {
    expect(inviteUrl("https://diskarte.ph/", "ABCDEFGH23")).toBe("https://diskarte.ph/invite/ABCDEFGH23");
  });
});

describe("roles", () => {
  const owner = "owner";
  it("ranks roles", () => {
    expect(hasRole("admin", "moderator")).toBe(true);
    expect(hasRole("member", "moderator")).toBe(false);
    expect(hasRole(null, "member")).toBe(false);
  });

  it("mirrors the database RBAC guards", () => {
    const target = (role: "member" | "moderator" | "admin", user_id = "t") => ({ role, user_id });
    expect(canManageMember({ actorRole: "admin", actorId: "a", target: target("member"), ownerId: owner })).toEqual({ timeout: true, changeRole: true, kick: true, rename: true });
    expect(canManageMember({ actorRole: "admin", actorId: "a", target: target("admin"), ownerId: owner })).toEqual({ timeout: false, changeRole: false, kick: false, rename: false });
    expect(canManageMember({ actorRole: "admin", actorId: owner, target: target("admin"), ownerId: owner })).toEqual({ timeout: false, changeRole: true, kick: true, rename: true });
    expect(canManageMember({ actorRole: "moderator", actorId: "m", target: target("member"), ownerId: owner })).toEqual({ timeout: true, changeRole: false, kick: true, rename: true });
    expect(canManageMember({ actorRole: "moderator", actorId: "m", target: target("moderator"), ownerId: owner })).toEqual({ timeout: false, changeRole: false, kick: false, rename: false });
    expect(canManageMember({ actorRole: "member", actorId: "x", target: target("member"), ownerId: owner })).toEqual({ timeout: false, changeRole: false, kick: false, rename: false });
    expect(canManageMember({ actorRole: "admin", actorId: "a", target: target("admin", owner), ownerId: owner })).toEqual({ timeout: false, changeRole: false, kick: false, rename: false });
    expect(canManageMember({ actorRole: "admin", actorId: "a", target: target("admin", "a"), ownerId: owner })).toEqual({ timeout: false, changeRole: false, kick: false, rename: true });
  });

  it("describes invite expiry like Discord", () => {
    const now = Date.parse("2026-10-13T10:00:00Z");
    expect(inviteExpiry(null, now)).toBe("Never expires");
    expect(inviteExpiry("2026-10-13T09:00:00Z", now)).toBe("Expired");
    expect(inviteExpiry("2026-10-13T10:30:00Z", now)).toBe("Expires in 30 minutes");
    expect(inviteExpiry("2026-10-13T16:00:00Z", now)).toBe("Expires in 6 hours");
    expect(inviteExpiry("2026-10-20T10:00:00Z", now)).toBe("Expires in 7 days");
  });

  it("knows when a timeout is still running", () => {
    expect(isTimedOut({ timeout_until: "2026-10-13T10:00:00Z" }, Date.parse("2026-10-13T09:59:00Z"))).toBe(true);
    expect(isTimedOut({ timeout_until: "2026-10-13T10:00:00Z" }, Date.parse("2026-10-13T10:00:01Z"))).toBe(false);
    expect(isTimedOut({ timeout_until: null })).toBe(false);
    expect(isTimedOut(undefined)).toBe(false);
  });
});

describe("channels", () => {
  it("groups by category in position order", () => {
    const mixed = [makeChannel("c3", "music", "voice", 3), ...channels, makeChannel("c9", "rules", "text", 9, "Info")];
    const groups = groupChannels(mixed);
    expect(groups.map((g) => g.category)).toEqual(["Text Channels", "Voice Channels", "Info"]);
    expect(groups[1].channels.map((c) => c.name)).toEqual(["Tambayan 1", "music"]);
  });

  it("finds the first text channel", () => {
    expect(firstTextChannel(channels)?.name).toBe("general");
    expect(firstTextChannel([channels[2]])).toBeUndefined();
  });

  it("validates channel input per type", () => {
    expect(channelSchema.parse({ name: "Ranked Grind", type: "text", category: "Games", topic: "" }).name).toBe("ranked-grind");
    expect(channelSchema.parse({ name: " Chill & Music ", type: "voice", category: "Voice", topic: "" }).name).toBe("Chill & Music");
    expect(channelSchema.safeParse({ name: "!!!", type: "text", category: "x", topic: "" }).success).toBe(false);
    expect(channelSchema.safeParse({ name: "ok", type: "text", category: "", topic: "" }).success).toBe(false);
  });
});

describe("servers", () => {
  it("validates server names", () => {
    expect(serverSchema.parse({ name: "  Barkada HQ ", description: "" }).name).toBe("Barkada HQ");
    expect(serverSchema.safeParse({ name: "x", description: "" }).success).toBe(false);
    expect(serverSchema.safeParse({ name: "ok name", description: "d".repeat(281) }).success).toBe(false);
  });

  it("derives initials", () => {
    expect(serverInitials("Barkada HQ")).toBe("BH");
    expect(serverInitials("mga tropa ng bayan")).toBe("MTN");
    expect(serverInitials(" ")).toBe("?");
  });
});
