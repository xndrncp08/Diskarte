"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { Button } from "@/components/ui/Button";

/** The code input for two-factor sign-in (and for re-checking before turning it off). */
export function MfaChallenge({ next }: { next: string }) {
  const supabase = useSupabase();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const factor = factors?.totp.find((f) => f.status === "verified");
      if (!factor) {
        return setError("No authenticator is set up on this account.");
      }
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
      if (verifyError) {
        return setError("That code didn't work. Check your authenticator app and try again.");
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError("We couldn't verify that code. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm font-semibold text-white">
        Authentication code
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoCapitalize="none"
          enterKeyHint="done"
          maxLength={6}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "mfa-code-error" : undefined}
          pattern="\d{6}"
          required
          autoFocus
          placeholder="123456"
          className="mt-1 h-12 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-center font-mono text-2xl tracking-[0.4em] text-white outline-none focus:border-sun/70"
        />
      </label>
      {error && (
        <p id="mfa-code-error" className="text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" loading={busy} disabled={code.length !== 6}>
        Verify
      </Button>
      <button type="button" onClick={() => void signOut()} className="block min-h-11 w-full text-center text-sm text-slate-400 hover:text-white hover:underline">
        Use a different account
      </button>
    </form>
  );
}
