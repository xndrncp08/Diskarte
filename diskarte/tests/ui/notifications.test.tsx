import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { desktopNotify, notificationsQuiet, parseNotifyPrefs, readNotifyPrefs, resetNotifyPrefsCache, serverNotify, setNotifyPrefs, setServerNotify } from "@/lib/notify-prefs";
import { MeProvider } from "@/components/providers/MeProvider";
import { makeProfile, OWNER_ID } from "../fixtures/server";

const { NotificationSettings } = await import("@/components/profile/NotificationSettings");

class FakeNotification {
  static permission: NotificationPermission = "default";
  static requestPermission = vi.fn(async () => FakeNotification.permission);
  static shown: { title: string; options: NotificationOptions }[] = [];
  onclick: (() => void) | null = null;
  constructor(title: string, options: NotificationOptions) {
    FakeNotification.shown.push({ title, options });
  }
  close() {}
}

beforeEach(() => {
  localStorage.clear();
  resetNotifyPrefsCache();
  FakeNotification.shown = [];
  FakeNotification.permission = "default";
  vi.stubGlobal("Notification", FakeNotification);
});
afterEach(() => vi.unstubAllGlobals());

describe("notification preferences", () => {
  it("handles overnight quiet hours, exact boundaries and temporary pauses", () => {
    const prefs = { desktop: true, dms: true, servers: {}, quietHours: { enabled: true, start: 22 * 60, end: 8 * 60 } };
    expect(notificationsQuiet(prefs, new Date(2026, 9, 14, 22))).toBe(true);
    expect(notificationsQuiet(prefs, new Date(2026, 9, 14, 7, 59))).toBe(true);
    expect(notificationsQuiet(prefs, new Date(2026, 9, 14, 8))).toBe(false);
    expect(notificationsQuiet(prefs, new Date(2026, 9, 14, 21, 59))).toBe(false);
    expect(notificationsQuiet({ ...prefs, doNotDisturbUntil: new Date(2026, 9, 14, 12).getTime() }, new Date(2026, 9, 14, 11))).toBe(true);
    setServerNotify("s1", { muted: true, muteUntil: Date.now() - 1 });
    expect(serverNotify(readNotifyPrefs(), "s1").muted).toBe(false);
  });
  it("default to @mentions per server, unmuted, desktop off, DMs on; bad data falls back", () => {
    expect(parseNotifyPrefs(null)).toEqual({ desktop: false, dms: true, servers: {} });
    expect(parseNotifyPrefs("{oops")).toEqual({ desktop: false, dms: true, servers: {} });
    setServerNotify("s1", { level: "nothing" });
    setServerNotify("s1", { muted: true });
    expect(serverNotify(readNotifyPrefs(), "s1")).toEqual({ level: "nothing", muted: true });
    expect(serverNotify(readNotifyPrefs(), "s2")).toEqual({ level: "mentions", muted: false });
  });

  it("only shows desktop notifications when switched on and allowed, and not for the page you're on", () => {
    const open = vi.fn();
    desktopNotify({ title: "Juan in #general", body: "hi", tag: "m1", href: "/x", open });
    expect(FakeNotification.shown).toHaveLength(0); // switched off
    setNotifyPrefs({ desktop: true });
    desktopNotify({ title: "Juan in #general", body: "hi", tag: "m1", href: "/x", open });
    expect(FakeNotification.shown).toHaveLength(0); // not allowed
    FakeNotification.permission = "granted";
    desktopNotify({ title: "Juan in #general", body: "hi", tag: "m1", href: "/elsewhere", open });
    expect(FakeNotification.shown).toEqual([{ title: "Juan in #general", options: expect.objectContaining({ body: "hi", tag: "m1" }) }]);
  });
});

describe("Notifications settings", () => {
  it("asks the browser before turning desktop notifications on, and explains a refusal", async () => {
    const user = userEvent.setup();
    FakeNotification.permission = "denied";
    vi.spyOn(globalThis,"fetch").mockResolvedValueOnce(Response.json({configured:false,publicKey:null,devices:[]}));
    render(<MeProvider profile={makeProfile(OWNER_ID,"Me")}><NotificationSettings /></MeProvider>);
    await user.click(screen.getByRole("switch", { name: /Enable Desktop Notifications/ }));
    expect(await screen.findByRole("status")).toHaveTextContent(/blocked/);
    expect(readNotifyPrefs().desktop).toBe(false);

    FakeNotification.permission = "default";
    FakeNotification.requestPermission.mockImplementationOnce(async () => {
      FakeNotification.permission = "granted";
      return "granted";
    });
    fireEvent.click(screen.getByRole("switch", { name: /Enable Desktop Notifications/ }));
    await waitFor(() => expect(readNotifyPrefs().desktop).toBe(true));
    await user.click(screen.getByRole("switch", { name: "Direct message notifications" }));
    expect(readNotifyPrefs().dms).toBe(false);
  });
});
