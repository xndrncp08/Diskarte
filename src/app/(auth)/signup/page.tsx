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
        <h1 className="text-2xl font-extrabold text-white">Invite-only muna ang Diskarte</h1>
        <p className="text-sm text-slate-400">
          Unti-unti naming binubuksan ang tambayan. Mag-apply sa waitlist — kapag na-approve ka, ie-email namin ang login details mo.
        </p>
        {policy.earlyAccessUrl && (
          <a
            href={policy.earlyAccessUrl}
            className="flex h-11 items-center justify-center rounded-xl bg-sun font-bold text-abyss shadow-[0_4px_0_0_#b45309] hover:brightness-110"
          >
            Mag-apply para sa Early Access ▶
          </a>
        )}
        <p className="text-center text-sm text-slate-400">
          Na-approve ka na?{" "}
          <Link href="/login" className="text-sky-300 hover:underline">
            Mag-login
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Sali sa bagong tambayan</h1>
        <p className="mt-1 text-sm text-slate-400">Libre, open-source, at walang shutdown-shutdown.</p>
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
