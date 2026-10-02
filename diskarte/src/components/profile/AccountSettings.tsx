import { ChangePasswordForm } from "@/components/profile/ChangePasswordForm";
import { DangerZone } from "@/components/profile/DangerZone";
import { LowDataToggle } from "@/components/profile/LowDataToggle";
import { SignOutButton } from "@/components/profile/SignOutButton";
import { SoundSettings } from "@/components/profile/SoundSettings";

export interface AccountInfo {
  email: string | null;
  /** Supabase sign-in providers on the account, e.g. ["email", "google"]. */
  providers: string[];
}

/** The account's sign-in providers from Supabase `app_metadata` (email when none are listed). */
export function signInMethods(appMetadata: { provider?: string; providers?: string[] } | undefined): string[] {
  return appMetadata?.providers ?? [appMetadata?.provider ?? "email"];
}

/**
 * Account details, password, 8-bit sounds, data saver, sessions and the danger zone. Shared by the /settings/account
 * page and the in-app Settings dialog (which keeps an active voice call connected).
 */
export function AccountSettings({ account, username, createdAt }: { account: AccountInfo; username: string; createdAt: string }) {
  const usesPassword = account.providers.includes("email");
  return (
    <div className="space-y-10">
      <section className="glass rounded-2xl p-5">
        <h2 className="mb-3 font-pixel text-[10px] text-sun">ACCOUNT</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Email</dt>
            <dd className="font-medium text-white">{account.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Username</dt>
            <dd className="font-medium text-white">@{username}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Sign-in methods</dt>
            <dd className="font-medium capitalize text-white">{account.providers.join(", ")}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Member since</dt>
            <dd className="font-medium text-white">{new Date(createdAt).toLocaleDateString("en-PH", { dateStyle: "long" })}</dd>
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
        <h2 className="mb-3 font-pixel text-[10px] text-sun">8-BIT SOUNDS</h2>
        <SoundSettings className="max-w-md" />
      </section>

      <section className="glass rounded-2xl p-5">
        <h2 className="mb-3 font-pixel text-[10px] text-sun">DATA SAVER</h2>
        <LowDataToggle className="max-w-md" />
      </section>

      <section className="glass rounded-2xl p-5">
        <h2 className="mb-1 font-pixel text-[10px] text-sun">SESSIONS</h2>
        <p className="mb-4 text-sm text-slate-400">
          Sessions are short-lived JWTs refreshed on every request. Lost your phone? Sign out of every device to revoke all
          refresh tokens.
        </p>
        <div className="flex flex-wrap gap-3">
          <SignOutButton />
          <SignOutButton scope="global" />
        </div>
      </section>

      <DangerZone username={username} />
    </div>
  );
}
