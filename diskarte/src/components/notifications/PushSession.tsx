"use client";
import { useEffect } from "react";
import { useMe } from "@/components/providers/MeProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { useSocial } from "@/components/providers/SocialProvider";
import { bindPushUser, clearLocalPush, pushApi, pushCapability, pushOperation, type PushSetup } from "@/lib/push-client";
import { getDeviceId } from "@/lib/device";
/** Silent reconciliation only. Permissions are requested exclusively from the settings button. */
export function PushSession() {
  const { me } = useMe(); const db = useSupabase();
  const { reloadConversations } = useSocial();
  useEffect(() => {
    if (pushCapability() !== "supported") return;
    let alive = true, checking = false;
    const reconcile = async () => {
      const operation = pushOperation();
      if (!alive || checking || operation.pending || document.visibilityState !== "visible") return;
      checking = true;
      try {
        const owner = localStorage.getItem("diskarte:push-owner");
        if (owner && (owner !== me.id || Notification.permission !== "granted")) {
          await clearLocalPush(); await pushApi({ action: "remove", device: getDeviceId() }).catch(() => undefined); return;
        }
        if (!owner) { await clearLocalPush(); return; }
        const registration = await navigator.serviceWorker.getRegistration("/");
        if (!await registration?.pushManager.getSubscription()) { await clearLocalPush(); await pushApi({ action: "remove", device: getDeviceId() }).catch(() => undefined); return; }
        const setup: PushSetup = await pushApi();
        if (!alive || operation.generation !== pushOperation().generation) return;
        if (!setup.devices.some((d) => d.device_id === getDeviceId())) { await clearLocalPush(); return; }
        await bindPushUser(me.id,registration,operation.generation);
        if (!alive || operation.generation !== pushOperation().generation) return;
        localStorage.setItem("diskarte:push-active", setup.configured ? "true" : "false");
      } catch { /* Do not destroy valid subscriptions when offline or the server is temporarily unavailable. */ }
      finally { checking = false; }
    };
    void reconcile();
    const focus = () => { void reconcile(); };
    const message = (event: MessageEvent) => {
      if (event.data?.type === "PUSH_SUBSCRIPTION_CHANGED") { void clearLocalPush().then(() => pushApi({ action: "remove", device: getDeviceId() })).catch(() => undefined); }
      if (event.data?.type === "PUSH_ACTIVITY") { void reloadConversations(); window.dispatchEvent(new Event("diskarte:push-activity")); }
    };
    const { data } = db.auth.onAuthStateChange?.((event,session) => { if (event === "SIGNED_OUT" || event === "SIGNED_IN" && session?.user.id !== me.id) { alive = false; void clearLocalPush(); } }) ?? {};
    window.addEventListener("online", focus); window.addEventListener("focus", focus); document.addEventListener("visibilitychange", focus);
    navigator.serviceWorker.addEventListener("message", message);
    return () => { alive = false; data?.subscription.unsubscribe(); window.removeEventListener("online", focus); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); navigator.serviceWorker.removeEventListener("message", message); };
  }, [me.id, db, reloadConversations]);
  return null;
}
