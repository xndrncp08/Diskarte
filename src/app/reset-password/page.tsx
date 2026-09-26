import type { Metadata } from "next";
import { DiskarteWordmark } from "@/components/brand/DiskarteWordmark";
import { ChangePasswordForm } from "@/components/profile/ChangePasswordForm";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Bagong password" };

/** Landing page for the password-recovery email (the callback established a recovery session). */
export default async function ResetPasswordPage() {
  await requireProfile("/reset-password");
  return (
    <main className="diskarte-backdrop relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="relative z-10 mb-6">
        <DiskarteWordmark height={48} />
      </div>
      <div className="glass-strong relative z-10 w-full max-w-md space-y-5 rounded-2xl p-6 sm:p-8">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Gumawa ng bagong password</h1>
          <p className="mt-1 text-sm text-slate-400">Pagkatapos nito, dadalhin ka namin pabalik sa tambayan.</p>
        </div>
        <ChangePasswordForm redirectTo="/tambayan" />
      </div>
    </main>
  );
}
