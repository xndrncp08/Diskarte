import type { Metadata } from "next";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { SignupForm } from "@/components/auth/SignupForm";
import { ConfigNotice } from "@/components/ConfigNotice";
import { tryGetPublicEnv } from "@/lib/env";
import { enabledOAuthProviders } from "@/lib/profile";
import { safeRedirectPath } from "@/lib/security";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const params = await searchParams;
  const next = safeRedirectPath(typeof params.next === "string" ? params.next : null, "/onboarding");

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
