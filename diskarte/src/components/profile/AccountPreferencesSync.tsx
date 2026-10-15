"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useAccountSync } from "@/hooks/useAccountSync";
import { DEFAULT_DISPLAY_PREFS, replaceDisplayPrefs, useDisplayPrefs } from "@/lib/display-prefs";
import { DEFAULT_NOTIFY_PREFS, readNotifyPrefs, replaceNotifyPrefs, subscribeNotifyPrefs } from "@/lib/notify-prefs";
import type { Json } from "@/lib/supabase/database.types";

type Sync = ReturnType<typeof useAccountSync>;
const Context = createContext<{ display: Sync; notifications: Sync } | null>(null);

export function AccountPreferencesSync({ userId, children }: { userId: string; children: ReactNode }) {
  const [bound, setBound] = useState(false);
  useEffect(() => {
    try {
      const owner = localStorage.getItem("diskarte:settings-owner");
      if (owner && owner !== userId) { replaceDisplayPrefs(DEFAULT_DISPLAY_PREFS); replaceNotifyPrefs(DEFAULT_NOTIFY_PREFS); }
      localStorage.setItem("diskarte:settings-owner", userId);
    } catch { /* session only */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- binding the existing device store to the signed-in account
    setBound(true);
  }, [userId]);
  const display = useDisplayPrefs();
  const notifications = useSyncExternalStore(subscribeNotifyPrefs, readNotifyPrefs, () => DEFAULT_NOTIFY_PREFS);
  const displaySync = useAccountSync(userId, "prefs:display", display as unknown as Json, replaceDisplayPrefs, bound);
  const notificationSync = useAccountSync(userId, "prefs:notifications", notifications as unknown as Json, replaceNotifyPrefs, bound);
  return <Context.Provider value={{ display: displaySync, notifications: notificationSync }}>{children}</Context.Provider>;
}

export function SyncNotice({ sync }: { sync: Sync }) {
  if (!sync.problem) return null;
  return <div role="status" className="space-y-2 rounded-xl border border-amber-300/25 bg-black/15 p-3 text-sm text-amber-200">
    <p>{sync.problem}</p>
    {sync.conflict ? <>
      {typeof sync.conflict.value === "string" && <details><summary className="min-h-11 cursor-pointer">Read the other draft</summary><p className="whitespace-pre-wrap break-words">{sync.conflict.value || "Empty draft"}</p></details>}
      <div className="flex flex-wrap gap-2"><button type="button" onClick={sync.keepLocal} className="min-h-11 rounded-lg bg-white/10 px-3">Use this device’s version</button><button type="button" onClick={sync.useRemote} className="min-h-11 rounded-lg bg-white/10 px-3">Use the other device’s version</button></div>
    </> : <button type="button" onClick={sync.retry} className="min-h-11 rounded-lg bg-white/10 px-3">Retry device sync</button>}
  </div>;
}

export function AccountSyncStatus({ kind }: { kind: "display" | "notifications" }) {
  const context = useContext(Context);
  return context ? <SyncNotice sync={context[kind]} /> : null;
}
