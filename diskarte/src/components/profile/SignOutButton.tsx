"use client";

import { LogOut, ShieldAlert } from "lucide-react";
import { useFormStatus } from "react-dom";
import { signOutAction } from "@/app/(auth)/actions";
import { clearOutbox } from "@/lib/outbox";
import { cn } from "@/lib/utils";

function Submit({ scope, className }: { scope: "local" | "global"; className?: string }) {
  const { pending } = useFormStatus();
  const everywhere = scope === "global";
  const Icon = everywhere ? ShieldAlert : LogOut;
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors disabled:opacity-60 pointer-coarse:h-11",
        everywhere ? "border border-red-400/40 text-red-200 hover:bg-red-500/15" : "bg-red-500/90 text-white shadow-[0_3px_0_0_#7f1d1d] hover:bg-red-500",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
      {pending ? "Signing out…" : everywhere ? "Sign out everywhere" : "Sign out"}
    </button>
  );
}

/**
 * Ends the session: the server action clears the auth cookies (this device, or every device for
 * `global`) and redirects to /auth; this device's unsent-message queue is cleared first.
 */
export function SignOutButton({ scope = "local", className }: { scope?: "local" | "global"; className?: string }) {
  return (
    <form action={signOutAction} onSubmit={clearOutbox} className="contents">
      <input type="hidden" name="scope" value={scope} />
      <Submit scope={scope} className={className} />
    </form>
  );
}
