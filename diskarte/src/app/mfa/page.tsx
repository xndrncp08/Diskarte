import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MfaChallenge } from "@/components/auth/MfaChallenge";
import { DiskarteWordmark } from "@/components/brand/DiskarteWordmark";
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
    <main className="diskarte-backdrop relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="relative z-10 mb-6">
        <DiskarteWordmark height={48} />
      </div>
      <div className="glass-strong relative z-10 w-full max-w-sm space-y-5 rounded-2xl p-6 sm:p-8">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Two-factor sign-in</h1>
          <p className="mt-1 text-sm text-slate-400">Enter the 6-digit code from your authenticator app.</p>
        </div>
        <MfaChallenge next={next} />
      </div>
    </main>
  );
}
