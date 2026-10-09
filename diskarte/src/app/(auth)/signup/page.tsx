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
        <p className="font-pixel text-[9px] text-sun">INVITE ONLY</p>
        <h1 className="text-2xl font-extrabold text-white">Sign-ups are paused for now</h1>
        <p className="text-sm text-slate-400">Diskarte isn&apos;t taking new registrations on this server right now. Check back soon, or ask the team for an invite.</p>
        <p className="text-center text-sm text-slate-400">
          Already have an account?{" "}
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
