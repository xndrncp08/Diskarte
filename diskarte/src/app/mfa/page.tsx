import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MfaChallenge } from "@/components/auth/MfaChallenge";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { getSessionUser, needsSecondFactor, signedOutPath } from "@/lib/auth";
import { safeRedirectPath } from "@/lib/security";

export const metadata: Metadata = { title: "Two-factor sign-in" };

/** The second step of two-factor sign-in: a code from the authenticator app. */
export default async function MfaPage({ searchParams }: PageProps<"/mfa">) {
  const raw = (await searchParams).next;
  const next = safeRedirectPath(typeof raw === "string" ? raw : null);
  if (!(await getSessionUser())) redirect(signedOutPath("/mfa"));
  if (!(await needsSecondFactor())) redirect(next);
  return (
    <AuthFrame>
      <div className="auth-content space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Two-factor sign-in</h1>
          <p className="mt-1 text-sm text-slate-400">Enter the 6-digit code from your authenticator app.</p>
        </div>
        <MfaChallenge next={next} />
      </div>
    </AuthFrame>
  );
}
