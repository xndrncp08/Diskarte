"use client";

import { useState, useSyncExternalStore } from "react";
import { Switch } from "@/components/ui/Switch";
import { DEFAULT_NOTIFY_PREFS, readNotifyPrefs, setNotifyPrefs, subscribeNotifyPrefs } from "@/lib/notify-prefs";
import { Button } from "@/components/ui/Button";
import { PushSettings } from "@/components/notifications/PushSettings";

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
  const quiet = prefs.quietHours ?? { enabled: false, start: 22 * 60, end: 8 * 60 };
  const time = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  const changeTime = (key: "start" | "end", value: string) => {
    if (!/^\d{2}:\d{2}$/.test(value)) return;
    const [hour, minute] = value.split(":").map(Number);
    setNotifyPrefs({ quietHours: { ...quiet, [key]: hour * 60 + minute } });
  };

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
      <PushSettings />
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
      <Switch checked={quiet.enabled} onChange={(enabled) => setNotifyPrefs({ quietHours: { ...quiet, enabled } })} label="Quiet hours" hint="Pause message sounds, incoming rings and desktop notifications during these local times." />
      {quiet.enabled && <div className="flex gap-3"><label className="flex flex-1 flex-col gap-1 text-sm">Start<input type="time" value={time(quiet.start)} onChange={(e) => changeTime("start", e.target.value)} className="min-h-11 rounded-lg border border-white/15 bg-midnight px-3 text-base" /></label><label className="flex flex-1 flex-col gap-1 text-sm">End<input type="time" value={time(quiet.end)} onChange={(e) => changeTime("end", e.target.value)} className="min-h-11 rounded-lg border border-white/15 bg-midnight px-3 text-base" /></label></div>}
      <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { setNotifyPrefs({ doNotDisturbUntil: Date.now() + 60 * 60 * 1000 }); setNote("Notifications paused for one hour."); }}>Pause for 1 hour</Button><Button variant="ghost" onClick={() => { setNotifyPrefs({ doNotDisturbUntil: 0 }); setNote("Temporary pause cleared. Quiet hours still apply."); }}>Clear pause</Button></div>
      <p className="text-xs text-slate-400">Per server: open the server menu → Notification Settings to choose @mentions only, nothing, or mute the server.</p>
    </div>
  );
}
