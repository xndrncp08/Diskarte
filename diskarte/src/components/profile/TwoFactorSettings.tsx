"use client";

import { ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { Button } from "@/components/ui/Button";
import { confirmAction } from "@/components/ui/ConfirmHost";

type Enrolment = { factorId: string; qr: string; secret: string };

/** Settings → Account: turn two-factor sign-in (authenticator app, TOTP) on or off. */
export function TwoFactorSettings() {
  const supabase = useSupabase();
  const [factorId, setFactorId] = useState<string | null | undefined>(undefined);
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactorId(data?.totp.find((f) => f.status === "verified")?.id ?? null);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
  }, [load]);

  async function start() {
    setBusy(true);
    // Clear any abandoned enrolment first (Supabase allows only a few unverified factors).
    const { data: existing } = await supabase.auth.mfa.listFactors();
    for (const f of existing?.all ?? []) if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` });
    setBusy(false);
    if (error || !data) return void toast.error("Couldn't start two-factor setup. Try again.");
    setEnrolment({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!enrolment) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrolment.factorId, code: code.trim() });
    setBusy(false);
    if (error) return void toast.error("That code didn't work. Make sure your phone's clock is right and try again.");
    toast.success("Two-factor sign-in is on.");
    setEnrolment(null);
    setCode("");
    void load();
  }

  function turnOff() {
    if (!factorId) return;
    confirmAction({
      title: "Turn off two-factor sign-in?",
      body: "Your account will be protected by your password only.",
      confirmLabel: "Turn off",
      onConfirm: async () => {
        const { error } = await supabase.auth.mfa.unenroll({ factorId });
        if (error) {
          toast.error("Couldn't turn it off. Sign in again with your code, then retry.");
          return false;
        }
        // Drop the aal2 claim so the session matches the account again.
        await supabase.auth.refreshSession();
        toast.success("Two-factor sign-in is off.");
        void load();
      },
    });
  }

  if (factorId === undefined) return <div className="h-16 animate-pulse rounded-xl bg-white/5" aria-hidden />;

  return (
    <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4" data-testid="two-factor">
      <div className="flex items-start gap-3">
        <ShieldCheck className={factorId ? "size-6 shrink-0 text-emerald-300" : "size-6 shrink-0 text-slate-500"} aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-white">Two-factor sign-in</h3>
          <p className="text-xs text-slate-400">
            {factorId ? "On. Signing in needs a code from your authenticator app." : "Add a code from an authenticator app (Google Authenticator, Authy, 1Password…) to every sign-in."}
          </p>
        </div>
        {factorId ? (
          <Button variant="secondary" size="sm" onClick={turnOff}>
            Turn off
          </Button>
        ) : (
          !enrolment && (
            <Button size="sm" onClick={() => void start()} loading={busy}>
              Set up
            </Button>
          )
        )}
      </div>
      {enrolment && (
        <form onSubmit={verify} className="space-y-3 border-t border-white/10 pt-3">
          <p className="text-sm text-slate-300">1. Scan this with your authenticator app, or enter the key by hand.</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- Supabase returns the QR code as an SVG data URL */}
          <img src={enrolment.qr} alt="QR code for your authenticator app" className="size-44 rounded-lg bg-white p-2" />
          <p className="break-all font-mono text-xs text-slate-300">{enrolment.secret}</p>
          <label className="block text-sm text-slate-300">
            2. Enter the 6-digit code it shows
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              aria-label="Authentication code"
              className="mt-1 h-10 w-40 rounded-lg border border-white/10 bg-black/40 px-3 text-center font-mono text-lg tracking-[0.3em] text-white"
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={busy} disabled={code.length !== 6}>
              Turn on
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => void supabase.auth.mfa.unenroll({ factorId: enrolment.factorId }).then(() => setEnrolment(null))}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
