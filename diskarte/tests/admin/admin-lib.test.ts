// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  adminError,
  broadcastMarkdown,
  broadcastSchema,
  DEFAULT_FILTERS,
  filterUsers,
  isBanned,
  isStickyLive,
  presenceOf,
  type AdminDevice,
  type AdminUser,
} from "@/lib/admin";
import { deviceLabel } from "@/lib/device";
import { coupledResize, defaultWorkspace, dockAdmin, findSeams, fromFraction, GAP, MIN_W, parseWorkspace, visibleRectsOf, type Rect } from "@/lib/workspace";

const NOW = Date.parse("2026-10-06T08:00:00Z");
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();

function device(extra: Partial<AdminDevice> = {}): AdminDevice {
  return {
    device_id: "d1",
    fingerprint: "0123456789abcdef0123456789abcdef",
    label: "Chrome on macOS",
    status: "online",
    custom_status: null,
    voice_channel_id: null,
    first_seen_at: ago(3600),
    last_seen_at: ago(10),
    ...extra,
  };
}

function user(username: string, extra: Partial<AdminUser> = {}): AdminUser {
  return {
    id: `id-${username}`,
    username,
    display_name: username[0].toUpperCase() + username.slice(1),
    avatar_preset: "araw",
    avatar_url: null,
    status: "online",
    custom_status: null,
    email: `${username}@diskarte.ph`,
    created_at: ago(86400),
    last_sign_in_at: ago(600),
    role: "member",
    banned_until: null,
    ban_reason: null,
    sessions: 1,
    last_seen_at: ago(10),
    devices: [device()],
    ...extra,
  };
}

describe("presence inspector states", () => {
  it("maps device heartbeats onto Online, AFK / Tulog, Nagluto ng Canton, Busy and Offline", () => {
    expect(presenceOf(user("a"), NOW).state).toBe("online");
    expect(presenceOf(user("b", { devices: [device({ status: "idle", custom_status: "AFK / Tulog" })] }), NOW).state).toBe("afk");
    expect(presenceOf(user("c", { devices: [device({ status: "idle", custom_status: "Nagluto ng Canton" })] }), NOW).state).toBe("canton");
    expect(presenceOf(user("d", { devices: [device({ status: "dnd" })] }), NOW).state).toBe("busy");
    expect(presenceOf(user("e", { devices: [device({ last_seen_at: ago(5 * 60) })] }), NOW).state).toBe("offline");
    expect(presenceOf(user("f", { devices: [] }), NOW).state).toBe("offline");
  });

  it("sees through Invisible and reports the voice channel of any live device", () => {
    const p = presenceOf(user("g", { devices: [device({ status: "invisible" }), device({ device_id: "d2", voice_channel_id: "vc1", last_seen_at: ago(40) })] }), NOW);
    expect(p).toEqual({ state: "online", invisible: true, voiceChannelId: "vc1" });
  });

  it("treats a permanent ban ('infinity') and a future ban as banned, an expired one as lifted", () => {
    expect(isBanned({ banned_until: "infinity" }, NOW)).toBe(true);
    expect(isBanned({ banned_until: new Date(NOW + 3600_000).toISOString() }, NOW)).toBe(true);
    expect(isBanned({ banned_until: ago(60) }, NOW)).toBe(false);
    expect(isBanned({ banned_until: null }, NOW)).toBe(false);
  });
});

describe("roster filtering", () => {
  const users = [
    user("juan"),
    user("maria", { role: "moderator", devices: [device({ status: "idle", custom_status: "Nagluto ng Canton", voice_channel_id: "vc1" })] }),
    user("pedro", { banned_until: "infinity", devices: [] }),
    user("supremo", { role: "super_admin", email: "der@diskarte.ph" }),
  ];
  const names = (f: Partial<typeof DEFAULT_FILTERS>, live = new Set<string>()) => filterUsers(users, { ...DEFAULT_FILTERS, ...f }, NOW, live).map((u) => u.username);

  it("searches username, display name and email", () => {
    expect(names({ query: "@mar" })).toEqual(["maria"]);
    expect(names({ query: "DER@" })).toEqual(["supremo"]);
  });

  it("filters by role, account status, presence and channel participation", () => {
    expect(names({ role: "moderator" })).toEqual(["maria"]);
    expect(names({ account: "banned" })).toEqual(["pedro"]);
    expect(names({ account: "active" })).not.toContain("pedro");
    expect(names({ presence: "canton" })).toEqual(["maria"]);
    expect(names({ presence: "offline" })).toEqual(["pedro"]);
    expect(names({ channel: "vc1" })).toEqual(["maria"]);
    // LiveKit participants count as "in voice" even before their heartbeat says so.
    expect(names({ channel: "voice" }, new Set(["id-juan"]))).toEqual(["juan", "maria"]);
    expect(names({ channel: "none" }, new Set(["id-juan"]))).toEqual(["pedro", "supremo"]);
  });
});

describe("broadcasts", () => {
  it("validates the composer payload", () => {
    const ok = broadcastSchema.safeParse({ title: " Hi ", body: "Body", tone: "info", targets: ["announcements"], sticky: false, stickyHours: null });
    expect(ok.success && ok.data.title).toBe("Hi");
    expect(broadcastSchema.safeParse({ title: "", body: "x", tone: "info", targets: ["announcements"], sticky: false, stickyHours: null }).success).toBe(false);
    expect(broadcastSchema.safeParse({ title: "t", body: "x", tone: "party", targets: ["announcements"], sticky: false, stickyHours: null }).success).toBe(false);
    expect(broadcastSchema.safeParse({ title: "t", body: "x", tone: "info", targets: [], sticky: false, stickyHours: null }).success).toBe(false);
    expect(broadcastSchema.safeParse({ title: "t", body: "x", tone: "info", targets: ["general"], sticky: false, stickyHours: null }).success).toBe(false);
  });

  it("composes the posted Markdown like the database does", () => {
    expect(broadcastMarkdown(" v2 ", "> [!INFO]\n> hi ")).toBe("## v2\n\n> [!INFO]\n> hi");
  });

  it("knows when a sticky banner is live", () => {
    expect(isStickyLive({ sticky: true, sticky_until: null, retracted_at: null }, NOW)).toBe(true);
    expect(isStickyLive({ sticky: true, sticky_until: ago(1), retracted_at: null }, NOW)).toBe(false);
    expect(isStickyLive({ sticky: true, sticky_until: null, retracted_at: ago(1) }, NOW)).toBe(false);
    expect(isStickyLive({ sticky: false, sticky_until: null, retracted_at: null }, NOW)).toBe(false);
  });

  it("explains database errors without leaking them", () => {
    expect(adminError('new row violates "NOT_AUTHORIZED"')).toBe("Only super admins can do that.");
    expect(adminError("CANNOT_BAN_SUPER_ADMIN")).toMatch(/Demote/);
    expect(adminError("some internal detail")).toBe("Something went wrong. Try again.");
  });
});

describe("device labels", () => {
  it("names common browsers and systems", () => {
    expect(deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36")).toBe("Chrome on macOS");
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe("Safari on iOS");
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0")).toBe("Firefox on Windows");
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36 EdgA/141 Edg/141.0")).toBe("Edge on Android");
  });
});

describe("Control Center panel geometry", () => {
  const B: Rect = { x: 0, y: 0, w: 1400, h: 840 };
  const mounted = { has: (id: string) => id !== "voice" };

  it("starts closed, and older saved layouts (without it) load with it closed", () => {
    expect(defaultWorkspace(B).panels.admin.closed).toBe(true);
    const legacy = defaultWorkspace(B, 5) as unknown as { panels: Record<string, unknown> };
    delete legacy.panels.admin;
    expect(parseWorkspace(JSON.stringify(legacy))?.panels.admin).toMatchObject({ closed: true });
  });

  it("docks against the right edge, full height, and chat gives way leaving the docking gap", () => {
    const s = dockAdmin(defaultWorkspace(B, 1), B, mounted, 2);
    const admin = fromFraction(s.panels.admin.rect, B);
    const main = fromFraction(s.panels.main.rect, B);
    expect(admin).toMatchObject({ y: 0, h: 840 });
    expect(admin.x + admin.w).toBe(1400);
    expect(main.x + main.w).toBe(admin.x - GAP);
    expect(s.panels.admin).toMatchObject({ closed: false, minimized: false });
    expect(s.panels.admin.z).toBeGreaterThan(s.panels.main.z);
  });

  it("shares a seam with chat, so resizing one scales the other with the gap intact", () => {
    const s = dockAdmin(defaultWorkspace(B, 1), B, mounted, 2);
    const rects = visibleRectsOf(s.panels, B, { has: () => true });
    delete rects.voice;
    expect(findSeams(rects)).toContainEqual(expect.objectContaining({ a: "main", b: "admin", orientation: "vertical" }));

    // Drag the Control Center's left edge 100 px left: chat narrows by exactly 100 px.
    const next = coupledResize(rects, "admin", "w", -100, 0, B);
    expect(next.admin!.w).toBe(rects.admin!.w + 100);
    expect(next.main!.w).toBe(rects.main!.w - 100);
    expect(next.admin!.x - (next.main!.x + next.main!.w)).toBe(GAP);

    // Widening chat into the Control Center compresses it down to its minimum, never past.
    const squeezed = coupledResize(rects, "main", "e", 2000, 0, B);
    expect(squeezed.admin!.w).toBe(MIN_W);
    expect(squeezed.admin!.x + squeezed.admin!.w).toBe(1400);
  });

  it("slides a panel left instead of crushing it below the minimum width", () => {
    const narrow: Rect = { x: 0, y: 0, w: 900, h: 700 };
    const s = dockAdmin(defaultWorkspace(narrow, 1), narrow, mounted, 2);
    const main = fromFraction(s.panels.main.rect, narrow);
    expect(main.w).toBeGreaterThanOrEqual(MIN_W);
  });
});
