"use client";

import { useActionState } from "react";
import { adminSignInAction, type LoginState } from "@/app/admin/auth-actions";

const input =
  "h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3.5 text-[15px] text-white outline-none focus:border-sun/70 focus:ring-2 focus:ring-sun/20";

export function AdminLoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(adminSignInAction, { error: initialError });
  return (
    <form action={action} className="space-y-4" data-testid="admin-login">
      <input type="hidden" name="next" value={next} />
      {state.error && (
        <p role="alert" className="rounded-xl border border-red-400/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-200">
          {state.error}
        </p>
      )}
      <div className="space-y-1.5">
        <label htmlFor="admin-email" className="block font-silk text-[11px] uppercase tracking-wider text-slate-300">
          Email
        </label>
        <input id="admin-email" name="email" type="email" autoComplete="username" required className={input} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="admin-password" className="block font-silk text-[11px] uppercase tracking-wider text-slate-300">
          Password
        </label>
        <input id="admin-password" name="password" type="password" autoComplete="current-password" required className={input} />
      </div>
      <button type="submit" disabled={pending} className="pixel-shadow h-11 w-full rounded-xl bg-sun font-bold text-abyss hover:brightness-110 active:translate-y-1 active:shadow-none disabled:opacity-60">
        {pending ? "Sandali…" : "Pumasok bilang admin"}
      </button>
    </form>
  );
}
