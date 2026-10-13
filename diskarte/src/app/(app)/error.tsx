"use client";

import Link from "next/link";
import { useEffect } from "react";
import { DiskarteLogo } from "@/components/brand/DiskarteLogo";

/**
 * Error boundary inside the signed-in app. It sits below (app)/layout's session providers, so a page
 * that fails to load replaces only the page — the call, presence and friends keep running. (The root
 * error boundary would unmount all of them and drop the call.)
 */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="diskarte-backdrop relative flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="relative z-10 flex flex-col items-center gap-4">
        <DiskarteLogo size={72} variant="mascot" />
        <h1 className="text-2xl font-extrabold text-white">This page didn&apos;t load</h1>
        <p className="max-w-sm text-slate-400">The connection may have dropped. You&apos;re still in your call if you were in one.</p>
        <div className="flex gap-2">
          <button type="button" onClick={retry} className="rounded-lg bg-sun px-4 py-2 font-semibold text-abyss">
            Try again
          </button>
          <Link href="/tambayan" className="rounded-lg border border-white/15 px-4 py-2 font-semibold text-slate-200 hover:bg-white/10">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
