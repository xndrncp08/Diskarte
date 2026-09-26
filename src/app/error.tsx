"use client";

import { useEffect } from "react";
import { DiskarteLogo } from "@/components/brand/DiskarteLogo";

/**
 * Root error boundary. Also catches Server Action responses rejected by proxy.ts
 * (HTTP 429 when a client exceeds the auth rate limit).
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="diskarte-backdrop relative flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="relative z-10 flex flex-col items-center gap-4">
        <DiskarteLogo size={88} variant="mascot" />
        <p className="font-pixel text-xs text-sun">CONTINUE?</p>
        <h1 className="text-2xl font-extrabold text-white">May nangyaring aberya</h1>
        <p className="max-w-sm text-slate-400">Baka masyadong mabilis ang mga request (rate limited) o may problema sa connection. Maghintay ng isang minuto at subukan ulit.</p>
        <button type="button" onClick={reset} className="rounded-lg bg-sun px-4 py-2 font-semibold text-abyss">
          Subukan ulit
        </button>
      </div>
    </main>
  );
}
