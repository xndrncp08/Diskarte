import type { Metadata } from "next";
import Link from "next/link";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { SignupForm } from "@/components/auth/SignupForm";
import { ConfigNotice } from "@/components/ConfigNotice";
import { tryGetPublicEnv } from "@/lib/env";
import { enabledOAuthProviders } from "@/lib/profile";
import { safeRedirectPath } from "@/lib/security";
import { signupPolicy } from "@/lib/signup-mode";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const params = await searchParams;
  const next = safeRedirectPath(typeof params.next === "string" ? params.next : null, "/onboarding");
  const policy = signupPolicy();

  if (policy.inviteOnly) {
    return (
      <div className="space-y-5" data-testid="invite-only">
        <p className="font-pixel text-[9px] text-sun">EARLY ACCESS</p>
        <h1 className="text-2xl font-extrabold text-white">Diskarte is invite-only for now</h1>
        <p className="text-sm text-slate-400">
          We&apos;re opening Diskarte gradually. Apply to the waitlist — once you&apos;re approved, we&apos;ll email your sign-in details.
        </p>
        {policy.earlyAccessUrl && (
          <a
            href={policy.earlyAccessUrl}
            className="flex h-11 items-center justify-center rounded-xl bg-sun font-bold text-abyss shadow-[0_4px_0_0_#b45309] hover:brightness-110"
          >
            Apply for Early Access
          </a>
        )}
        <p className="text-center text-sm text-slate-400">
          Already approved?{" "}
          <Link href="/login" className="text-sky-300 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Create your account</h1>
        <p className="mt-1 text-sm text-slate-400">Free, open-source, and walang shutdown-shutdown.</p>
      </div>
      {tryGetPublicEnv() ? (
        <>
          <SignupForm />
          <OAuthButtons providers={enabledOAuthProviders()} next={next} />
        </>
      ) : (
        <ConfigNotice />
      )}
    </div>
  );
}
