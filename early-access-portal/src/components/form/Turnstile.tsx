"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; remove: (id: string) => void };
  }
}

/**
 * Cloudflare Turnstile, rendered explicitly (the widget lives on the last form step, which mounts
 * after the script loads). It adds the `cf-turnstile-response` field to the surrounding form.
 */
export function Turnstile({ siteKey, nonce }: { siteKey: string; nonce?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(() => typeof window !== "undefined" && Boolean(window.turnstile));

  useEffect(() => {
    if (!ready || !box.current || !window.turnstile) return;
    const id = window.turnstile.render(box.current, { sitekey: siteKey, theme: "dark", size: "flexible" });
    return () => window.turnstile?.remove(id);
  }, [ready, siteKey]);

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" nonce={nonce} onReady={() => setReady(true)} />
      <div ref={box} className="min-h-16" data-testid="turnstile" />
    </>
  );
}
