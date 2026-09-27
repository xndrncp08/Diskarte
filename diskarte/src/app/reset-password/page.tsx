import type { Metadata } from "next";
import { DiskarteWordmark } from "@/components/brand/DiskarteWordmark";
import { ChangePasswordForm } from "@/components/profile/ChangePasswordForm";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Bagong password" };

/**
 * Landing page for the password-recovery email (the callback established a recovery session), and
 * the forced first stop for Early Access accounts that still have their emailed temporary password.
 */
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { user } = await requireProfile("/reset-password");
  const first = (await searchParams).first === "1" || user.user_metadata?.must_change_password === true;
  return (
    <main className="diskarte-backdrop relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="relative z-10 mb-6">
        <DiskarteWordmark height={48} />
      </div>
      <div className="glass-strong relative z-10 w-full max-w-md space-y-5 rounded-2xl p-6 sm:p-8">
        <div>
          {first ? (
            <>
              <p className="font-pixel text-[9px] text-sun">EARLY ACCESS · UNANG LOGIN</p>
              <h1 className="mt-2 text-2xl font-extrabold text-white">Palitan muna ang temporary password mo</h1>
              <p className="mt-1 text-sm text-slate-400">
                Maligayang pagdating! Para sa seguridad mo, gumawa ng sariling password bago pumasok sa tambayan.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-extrabold text-white">Gumawa ng bagong password</h1>
              <p className="mt-1 text-sm text-slate-400">Pagkatapos nito, dadalhin ka namin pabalik sa tambayan.</p>
            </>
          )}
        </div>
        {/* First login: straight to onboarding (a Server Action redirect renders its target directly). */}
        <ChangePasswordForm redirectTo={first ? "/onboarding" : "/tambayan"} />
      </div>
    </main>
  );
}
