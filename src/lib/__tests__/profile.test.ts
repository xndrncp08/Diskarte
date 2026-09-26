import { describe, expect, it } from "vitest";
import { friendlyAuthError } from "@/lib/auth-errors";
import {
  AVATAR_PRESET_KEYS,
  BANNER_PRESET_KEYS,
  credentialsSchema,
  enabledOAuthProviders,
  isAllowedImageUrl,
  profileUpdateSchema,
  resolveAvatarPreset,
  resolveBannerCss,
  signUpSchema,
  STATUS_TRIGGERS,
  stripControl,
  usernameSchema,
} from "@/lib/profile";

const base = {
  username: "Juan.Tamad",
  displayName: "  Juan  ",
  bio: "Main ko si Jett",
  avatarPreset: "ube",
  bannerPreset: "watawat",
  avatarUrl: "",
  bannerUrl: "",
  status: "online",
  customStatus: "Nagluto ng Canton",
  customStatusEmoji: "🍜",
};

describe("presets", () => {
  it("only uses keys the database accepts", () => {
    for (const key of [...AVATAR_PRESET_KEYS, ...BANNER_PRESET_KEYS]) expect(key).toMatch(/^[a-z0-9-]{2,24}$/);
  });

  it("falls back for unknown presets", () => {
    expect(resolveAvatarPreset("nope").label).toBe("Araw");
    expect(resolveBannerCss(null)).toContain("linear-gradient");
  });

  it("ships the Filipino status triggers", () => {
    expect(STATUS_TRIGGERS.map((t) => t.text)).toEqual(expect.arrayContaining(["Nagluto ng Canton", "AFK / Tulog", "LFG"]));
  });
});

describe("usernameSchema", () => {
  it("normalises case and whitespace", () => {
    expect(usernameSchema.parse("  Kapitan_Tiago ")).toBe("kapitan_tiago");
  });
  it.each(["ab", "has space", "emoji😀", "a".repeat(33), "semi;colon"])("rejects %s", (bad) => {
    expect(usernameSchema.safeParse(bad).success).toBe(false);
  });
});

describe("profileUpdateSchema", () => {
  it("normalises a valid update", () => {
    const parsed = profileUpdateSchema.parse(base);
    expect(parsed).toMatchObject({ username: "juan.tamad", displayName: "Juan", avatarUrl: null, bannerUrl: null, customStatusEmoji: "🍜" });
  });

  it("clears empty custom status", () => {
    expect(profileUpdateSchema.parse({ ...base, customStatus: "   ", customStatusEmoji: "" })).toMatchObject({ customStatus: null, customStatusEmoji: null });
  });

  it("strips control characters", () => {
    expect(profileUpdateSchema.parse({ ...base, displayName: "Ju\u0000an\u0007" }).displayName).toBe("Juan");
    expect(stripControl("a\nb\u0001", true)).toBe("a\nb");
  });

  it("rejects unknown presets, statuses and oversized bios", () => {
    expect(profileUpdateSchema.safeParse({ ...base, avatarPreset: "hacker" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ ...base, status: "away" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ ...base, bio: "x".repeat(191) }).success).toBe(false);
  });

  it("only accepts images from our bucket or OAuth avatar hosts", () => {
    const ok = "https://abc.supabase.co/storage/v1/object/public/avatars/u/avatar-1.png";
    expect(profileUpdateSchema.parse({ ...base, avatarUrl: ok }).avatarUrl).toBe(ok);
    expect(isAllowedImageUrl("https://avatars.githubusercontent.com/u/1?v=4")).toBe(true);
    for (const bad of ["http://abc.supabase.co/storage/v1/object/public/avatars/x.png", "https://evil.example/x.png", "javascript:alert(1)", "https://user:pw@abc.supabase.co/storage/v1/object/public/avatars/x.png"]) {
      expect(isAllowedImageUrl(bad)).toBe(false);
    }
  });
});

describe("auth schemas", () => {
  it("validates credentials", () => {
    expect(credentialsSchema.safeParse({ email: " JUAN@Example.com ", password: "12345678" })).toMatchObject({ success: true, data: { email: "juan@example.com" } });
    expect(credentialsSchema.safeParse({ email: "nope", password: "short" }).success).toBe(false);
  });

  it("requires username and display name at sign-up", () => {
    expect(signUpSchema.safeParse({ email: "a@b.co", password: "12345678", username: "x", displayName: "" }).success).toBe(false);
  });

  it("parses enabled OAuth providers", () => {
    expect(enabledOAuthProviders("github, Discord ,myspace")).toEqual(["github", "discord"]);
    expect(enabledOAuthProviders("")).toEqual([]);
    expect(enabledOAuthProviders(undefined)).toEqual(["github", "google"]);
  });
});

describe("friendlyAuthError", () => {
  it("maps Supabase messages to Taglish", () => {
    expect(friendlyAuthError("Invalid login credentials")).toBe("Mali ang email o password.");
    expect(friendlyAuthError("User already registered")).toMatch(/May account na/);
    expect(friendlyAuthError("Email not confirmed")).toMatch(/I-confirm/);
    expect(friendlyAuthError("socket hang up")).toBe("May nangyaring mali. Subukan ulit.");
  });
});
