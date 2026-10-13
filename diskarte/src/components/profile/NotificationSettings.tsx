"use client";

import { useState, useSyncExternalStore } from "react";
import { Switch } from "@/components/ui/Switch";
import { DEFAULT_NOTIFY_PREFS, readNotifyPrefs, setNotifyPrefs, subscribeNotifyPrefs } from "@/lib/notify-prefs";

function usePermission() {
  return useSyncExternalStore(
    () => () => undefined,
    () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission),
    () => "default",
  );
}

/** Desktop and DM alerts. Per-server levels and mute live in each server's menu. */
export function NotificationSettings() {
  const prefs = useSyncExternalStore(subscribeNotifyPrefs, readNotifyPrefs, () => DEFAULT_NOTIFY_PREFS);
  const permission = usePermission();
  const [note, setNote] = useState<string | null>(null);

  async function toggleDesktop(on: boolean) {
    setNote(null);
    if (!on) return setNotifyPrefs({ desktop: false });
    if (permission === "unsupported") return setNote("This browser doesn't support desktop notifications.");
    const result = permission === "granted" ? "granted" : await Notification.requestPermission();
    if (result !== "granted") return setNote("Notifications are blocked for Diskarte. Allow them in your browser's site settings, then try again.");
    setNotifyPrefs({ desktop: true });
  }

  return (
    <div className="max-w-md space-y-3" data-testid="notification-settings">
      <Switch
        checked={prefs.desktop && permission === "granted"}
        onChange={(on) => void toggleDesktop(on)}
        label="Enable Desktop Notifications"
        hint="When someone @mentions you or sends you a DM while you're elsewhere."
      />
      {note && (
        <p className="text-xs text-amber-200" role="status">
          {note}
        </p>
      )}
      <Switch checked={prefs.dms} onChange={(dms) => setNotifyPrefs({ dms })} label="Direct message notifications" />
      <p className="text-xs text-slate-400">Per server: open the server menu → Notification Settings to choose @mentions only, nothing, or mute the server.</p>
    </div>
  );
}
