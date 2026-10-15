import { deviceLabel, getDeviceId } from "./device";
export type PushCapability = "supported" | "install-ios" | "insecure" | "unsupported";
export function pushCapability() : PushCapability {
  if (typeof window === "undefined" || !window.isSecureContext) return "insecure";
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return "install-ios";
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window ? "supported" : "unsupported";
}
export async function pushApi(value?: unknown) {
  const response = await fetch("/api/push/subscription", { ...(value ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) } : {}), cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Push notifications are unavailable.");
  if (!value && (typeof data.configured !== "boolean" || !Array.isArray(data.devices) || data.devices.some((device: Partial<PushDevice>) => !device || typeof device.device_id !== "string" || typeof device.label !== "string"))) throw new Error("Push setup couldn’t be read. Reload Diskarte and try again.");
  return data;
}
export interface PushDevice { id: string; device_id: string; label: string; created_at: string; last_delivered_at: string | null }
export interface PushSetup { configured: boolean; publicKey: string | null; devices: PushDevice[] }
async function registration() { return await navigator.serviceWorker.getRegistration("/"); }
export async function bindPushUser(userId: string | null, reg?: ServiceWorkerRegistration) {
  const worker = (reg ?? await registration())?.active;
  if (!worker) return;
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error("Notification worker didn’t respond. Reload Diskarte and try again.")); }, 4000);
    channel.port1.onmessage = (event) => { clearTimeout(timer); channel.port1.close(); if (event.data?.ok) resolve(); else reject(new Error("Notification storage is unavailable.")); };
    worker.postMessage({ type: "PUSH_BIND", userId }, [channel.port2]);
  });
}
export async function clearLocalPush() {
  try { localStorage.removeItem("diskarte:push-active"); localStorage.removeItem("diskarte:push-owner"); } catch { /* storage blocked */ }
  if (!("serviceWorker" in navigator)) return;
  await bindPushUser(null).catch(() => undefined);
  const reg = await registration().catch(() => undefined);
  await reg?.pushManager.getSubscription().then((sub) => sub?.unsubscribe()).catch(() => undefined);
}
export async function enablePush(userId: string, publicKey: string) {
  // This must be the first async operation, directly inside the Enable button's click handler on iOS.
  const permission = Notification.permission === "granted" ? "granted" : Notification.permission === "denied" ? "denied" : await Notification.requestPermission();
  if (permission !== "granted") throw new Error(permission === "denied" ? "Notifications are blocked. Allow Diskarte in browser or OS notification settings, then reopen the app." : "Permission was dismissed. Use Enable notifications when you’re ready.");
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  // A newly installed worker must activate before PushManager is usable.
  if (!reg.active) await new Promise<void>((resolve, reject) => {
    const worker = reg.installing ?? reg.waiting;
    const timer = setTimeout(() => { worker?.removeEventListener("statechange", check); reject(new Error("App update is still installing. Reload and try again.")); }, 8000);
    function check() { if (worker?.state === "activated") { clearTimeout(timer); worker.removeEventListener("statechange", check); resolve(); } }
    worker?.addEventListener("statechange", check); check();
  });
  const previous = localStorage.getItem("diskarte:push-owner");
  if (previous && previous !== userId) await clearLocalPush();
  let sub = await reg.pushManager.getSubscription();
  const bytes = Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  if (sub?.options.applicationServerKey && !equalBytes(new Uint8Array(sub.options.applicationServerKey), bytes)) { await sub.unsubscribe(); sub = null; }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
  try {
    await pushApi({ action: "register", device: getDeviceId(), label: deviceLabel(navigator.userAgent), subscription: sub.toJSON() });
    await bindPushUser(userId, reg);
    localStorage.setItem("diskarte:push-owner", userId); localStorage.setItem("diskarte:push-active", "true");
  } catch (error) {
    await pushApi({ action: "remove", device: getDeviceId() }).catch(() => undefined);
    await bindPushUser(null, reg).catch(() => undefined); await sub.unsubscribe().catch(() => undefined); throw error;
  }
}
function equalBytes(a: Uint8Array, b: Uint8Array) { return a.length === b.length && a.every((value, i) => value === b[i]); }
