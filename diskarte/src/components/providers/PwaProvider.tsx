"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }
interface PwaState { canInstall: boolean; installed: boolean; updateAvailable: boolean; error: string; install(): Promise<void>; update(): void; clearCache(): Promise<void> }
const PwaContext = createContext<PwaState | null>(null);

export function PwaProvider({ children }: { children: ReactNode }) {
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [error, setError] = useState("");
  const prompt = useRef<InstallPrompt | null>(null);
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const applying = useRef(false);
  useEffect(() => {
    let live = true;
    const before = (e: Event) => { e.preventDefault(); prompt.current = e as InstallPrompt; setCanInstall(true); };
    const installed = () => { prompt.current = null; setCanInstall(false); setInstalled(true); };
    const standalone = window.matchMedia("(display-mode: standalone)");
    const display = () => setInstalled(standalone.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    display();
    standalone.addEventListener?.("change", display);
    window.addEventListener("beforeinstallprompt", before);
    window.addEventListener("appinstalled", installed);
    let unwatch = () => {};
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((reg) => {
        if (!live) return;
        registration.current = reg;
        const check = () => { if (live && reg.waiting && navigator.serviceWorker.controller) setUpdateAvailable(true); };
        const worker = () => {
          const installing = reg.installing;
          if (!installing) return;
          const state = () => { check(); if (installing.state === "installed" || installing.state === "redundant") installing.removeEventListener("statechange", state); };
          installing.addEventListener("statechange", state);
        };
        const controller = () => { if (applying.current) window.location.reload(); };
        const refresh = () => { if (document.visibilityState === "visible" && navigator.onLine) void reg.update().catch(() => undefined); };
        check(); reg.addEventListener("updatefound", worker);
        navigator.serviceWorker.addEventListener("controllerchange", controller);
        document.addEventListener("visibilitychange", refresh); window.addEventListener("online", refresh);
        unwatch = () => { reg.removeEventListener("updatefound", worker); navigator.serviceWorker.removeEventListener("controllerchange", controller); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("online", refresh); };
      }).catch(() => { if (live) setError("Offline support couldn’t start. You can still use Diskarte online."); });
    }
    return () => { live = false; unwatch(); standalone.removeEventListener?.("change", display); window.removeEventListener("beforeinstallprompt", before); window.removeEventListener("appinstalled", installed); };
  }, []);
  const install = async () => {
    if (!prompt.current) return;
    try { await prompt.current.prompt(); await prompt.current.userChoice; prompt.current = null; setCanInstall(false); }
    catch { setError("Installation couldn’t start. Use your browser’s install menu."); }
  };
  const update = () => { if (registration.current?.waiting) { applying.current = true; registration.current.waiting.postMessage("SKIP_WAITING"); } };
  const clearCache = async () => {
    if (!("caches" in window)) return;
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("diskarte-static-")).map(async (key) => {
      const cache = await caches.open(key);
      const requests = await cache.keys();
      await Promise.all(requests.filter((request) => !["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png"].includes(new URL(request.url).pathname)).map((request) => cache.delete(request)));
    }));
  };
  return <PwaContext.Provider value={{ canInstall, installed, updateAvailable, error, install, update, clearCache }}>{children}</PwaContext.Provider>;
}
export function usePwa() { return useContext(PwaContext); }
