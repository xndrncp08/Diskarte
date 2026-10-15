"use client";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { useMe } from "@/components/providers/MeProvider";
import { useNotificationSync } from "@/components/profile/AccountPreferencesSync";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { DEFAULT_NOTIFY_PREFS, DEFAULT_PUSH_PREFS, readNotifyPrefs, setNotifyPrefs, subscribeNotifyPrefs, type PushKind, type PushPrefs } from "@/lib/notify-prefs";
import { clearLocalPush, enablePush, pushApi, pushCapability, type PushCapability, type PushSetup } from "@/lib/push-client";
import { getDeviceId } from "@/lib/device";
import { syncChannelMutes } from "@/lib/channel-mute";
const labels: [PushKind,string][] = [["mention","Mentions and role mentions"],["reply","Replies"],["friend","Friend requests"],["invitation","Community invitations"],["call","Call invitations"],["event","Event reminders"],["moderation","Moderation notices"],["security","Account notifications"]];
export function PushSettings() {
  const { me } = useMe();
  const headingId = useId();
  const sync = useNotificationSync();
  const prefs = useSyncExternalStore(subscribeNotifyPrefs, readNotifyPrefs, () => DEFAULT_NOTIFY_PREFS);
  const push = prefs.push ?? DEFAULT_PUSH_PREFS;
  const [capability,setCapability] = useState<PushCapability>("unsupported"), [permission,setPermission] = useState<NotificationPermission>("default");
  const [setup,setSetup] = useState<PushSetup | null>(null), [note,setNote] = useState(""), [busy,setBusy] = useState(false), [active,setActive] = useState(false);
  const update = (patch: Partial<PushPrefs>) => setNotifyPrefs({ push: { ...push, timeZone: prefs.push?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone, ...patch } });
  useEffect(() => {
    const refresh = () => { setCapability(pushCapability()); setPermission(typeof Notification === "undefined" ? "default" : Notification.permission); setActive(localStorage.getItem("diskarte:push-owner") === me.id && localStorage.getItem("diskarte:push-active") === "true"); };
    refresh(); let alive = true;
    void pushApi().then((value: PushSetup) => { if (alive) setSetup(value); }).catch((error) => { if (alive) setNote(error.message); });
    window.addEventListener("focus",refresh);
    return () => { alive = false; window.removeEventListener("focus",refresh); };
  }, [me.id]);
  const run = async (action: () => Promise<void>) => { setBusy(true); setNote(""); try { await action(); setSetup(await pushApi()); } catch (error) { setNote(error instanceof Error ? error.message : "Push settings couldn’t be updated."); } finally { setBusy(false); setPermission(typeof Notification === "undefined" ? "default" : Notification.permission); } };
  return <section className="space-y-3 border-b border-white/10 pb-5" aria-labelledby={headingId}>
    <h3 id={headingId} className="font-semibold">Mobile &amp; background notifications</h3>
    <p className="text-sm text-slate-400">OS notifications can arrive while Diskarte is closed. Your browser and system Focus settings control how they appear.</p>
    {capability === "install-ios" ? <p className="rounded-xl bg-white/5 p-3 text-sm">On iPhone or iPad: open Diskarte in Safari, choose Share → Add to Home Screen, then open the installed app and enable notifications. Requires iOS/iPadOS 16.4 or later.</p> : capability !== "supported" ? <p className="text-sm text-amber-200">{capability === "insecure" ? "Notifications require a secure HTTPS connection." : "This browser doesn’t support Web Push. Try a compatible browser or installed app."}</p> : <>
      {setup && !setup.configured && <p className="text-sm text-amber-200">Server push setup is incomplete. An administrator must configure VAPID keys and database delivery before enabling this device.</p>}
      {permission === "denied" && <p className="text-sm text-amber-200">Notifications are blocked. Allow Diskarte in browser site settings or Settings → Notifications, then reopen the app. OS Focus or battery restrictions can delay alerts.</p>}
      <Button disabled={busy || !setup?.configured || permission === "denied"} onClick={() => void run(async () => {
        await enablePush(me.id,setup!.publicKey!); syncChannelMutes(); setActive(true); update({ enabled: true, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }); setNote("This device is enabled. Send a test to check server delivery.");
      })}>{active && permission === "granted" ? "Reconnect this device" : "Enable notifications on this device"}</Button>
    </>}
      <Switch checked={push.enabled} onChange={(enabled) => update({ enabled })} label="Allow push on my devices" hint="Account-wide delivery preference. Device permission remains under your browser’s control." />
      <Switch checked={push.events.dm && prefs.dms} onChange={(enabled) => { setNotifyPrefs({ dms: enabled, push: { ...push, timeZone: prefs.push?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone, events: { ...push.events, dm: enabled } } }); }} label="Direct and group DM push" />
      {labels.map(([kind,label]) => <Switch key={kind} checked={push.events[kind]} onChange={(enabled) => update({ events: { ...push.events, [kind]: enabled } })} label={label} />)}
      <Switch checked={push.previews} onChange={(previews) => update({ previews })} label="Show sender and message previews" hint="Off by default. Enabling this can reveal private content on your lock screen." />
      <Switch checked={push.sound} onChange={(sound) => update({ sound })} label="Request notification sounds" hint="Sound and action support depend on your browser and OS. Quiet hours and Do Not Disturb below also apply to push." />
      {sync?.pending && <p className="text-xs text-slate-400">Saving delivery preferences across devices…</p>}
      <p className="text-xs text-slate-400">Quiet hours follow {push.timeZone}. Reconnecting this device updates that time zone.</p>
      <Button variant="secondary" disabled={busy || !active || !push.enabled || !setup?.configured || sync?.pending} onClick={() => void run(async () => { await pushApi({ action:"test",device:getDeviceId() }); setNote("Test queued on the server. Quiet hours and notification preferences still apply; queueing doesn’t confirm delivery."); })}>Send test notification</Button>
    {!!setup?.devices.length && <div className="space-y-2"><h4 className="text-sm font-semibold">Notification devices</h4>{setup.devices.map((device) => <div key={device.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 p-3"><div className="min-w-0 text-sm"><p className="truncate">{device.label}</p><p className="text-xs text-slate-400">{device.last_delivered_at ? `Push service accepted ${new Date(device.last_delivered_at).toLocaleString()}` : "No delivery accepted yet"}</p></div><Button variant="ghost" disabled={busy} aria-label={`Remove ${device.label}`} onClick={() => void run(async () => { await pushApi({ action:"remove",device:device.device_id }); if (device.device_id===getDeviceId()) { await clearLocalPush(); setActive(false); } setNote("Notification device removed."); })}>Remove</Button></div>)}</div>}
    {note && <p role="status" className="text-sm text-amber-200">{note}</p>}
  </section>;
}
