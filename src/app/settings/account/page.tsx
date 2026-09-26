import type { Metadata } from "next";
import { LogOut, ShieldAlert } from "lucide-react";
import { signOutAction } from "@/app/(auth)/actions";
import { ChangePasswordForm } from "@/components/profile/ChangePasswordForm";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Account & Sessions" };

export default async function AccountSettingsPage() {
  const { user, profile } = await requireProfile("/settings/account");
  const providers = (user.app_metadata?.providers as string[] | undefined) ?? [user.app_metadata?.provider ?? "email"];
  const usesPassword = providers.includes("email");

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-extrabold text-white">Account &amp; Sessions</h1>

      <section className="glass rounded-2xl p-5">
        <h2 className="mb-3 font-pixel text-[10px] text-sun">ACCOUNT</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Email</dt>
            <dd className="font-medium text-white">{user.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Username</dt>
            <dd className="font-medium text-white">@{profile.username}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Sign-in methods</dt>
            <dd className="font-medium capitalize text-white">{providers.join(", ")}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Member since</dt>
            <dd className="font-medium text-white">{new Date(profile.created_at).toLocaleDateString("en-PH", { dateStyle: "long" })}</dd>
          </div>
        </dl>
      </section>

      {usesPassword && (
        <section className="glass rounded-2xl p-5">
          <h2 className="mb-3 font-pixel text-[10px] text-sun">PASSWORD</h2>
          <ChangePasswordForm />
        </section>
      )}

      <section className="glass rounded-2xl p-5">
        <h2 className="mb-1 font-pixel text-[10px] text-sun">SESSIONS</h2>
        <p className="mb-4 text-sm text-slate-400">
          Sessions are short-lived JWTs refreshed on every request. Nawala ang phone mo? Mag-log out sa lahat ng devices para i-revoke ang
          lahat ng refresh tokens.
        </p>
        <div className="flex flex-wrap gap-3">
          <form action={signOutAction}>
            <input type="hidden" name="scope" value="local" />
            <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 text-sm font-semibold hover:bg-white/10">
              <LogOut className="size-4" aria-hidden /> Log out dito
            </button>
          </form>
          <form action={signOutAction}>
            <input type="hidden" name="scope" value="global" />
            <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-500/90 px-4 text-sm font-semibold text-white hover:bg-red-500">
              <ShieldAlert className="size-4" aria-hidden /> Log out sa lahat ng devices
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
