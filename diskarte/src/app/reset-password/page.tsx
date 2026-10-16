import type { Metadata } from "next";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { ChangePasswordForm } from "@/components/profile/ChangePasswordForm";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "New password" };

/**
 * Landing page for the password-recovery email (the callback established a recovery session), and
 * the forced first stop for accounts that still have a temporary password.
 */
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { user } = await requireProfile("/reset-password");
  const first = (await searchParams).first === "1" || user.user_metadata?.must_change_password === true;
  return (
    <AuthFrame>
      <div className="auth-content space-y-5">
        <div>
          {first ? (
            <>
              <p className="font-pixel text-[9px] text-sun">FIRST SIGN-IN</p>
              <h1 className="mt-2 text-2xl font-extrabold text-white">Change your temporary password</h1>
              <p className="mt-1 text-sm text-slate-400">
                Welcome! For your security, create your own password before you continue.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-extrabold text-white">Create a new password</h1>
              <p className="mt-1 text-sm text-slate-400">After this, we&apos;ll take you back to your servers.</p>
            </>
          )}
        </div>
        {/* First login: straight to onboarding (a Server Action redirect renders its target directly). */}
        <ChangePasswordForm redirectTo={first ? "/onboarding" : "/tambayan"} />
      </div>
    </AuthFrame>
  );
}
