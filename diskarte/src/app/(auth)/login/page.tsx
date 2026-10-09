import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { ConfigNotice } from "@/components/ConfigNotice";
import { tryGetPublicEnv } from "@/lib/env";
import { enabledOAuthProviders } from "@/lib/profile";
import { emailSchema } from "@/lib/profile";
import { safeRedirectPath } from "@/lib/security";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeRedirectPath(typeof params.next === "string" ? params.next : null);
  const error = typeof params.error === "string" ? params.error.slice(0, 200) : null;
  // Links may pre-fill the address (e.g. after an invite). Only a syntactically valid email is echoed back.
  const email = typeof params.email === "string" ? emailSchema.safeParse(params.email) : null;
  const deleted = params.deleted === "1";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Welcome back!</h1>
        <p className="mt-1 text-sm text-slate-400">Sign in to get back to your servers and friends.</p>
      </div>
      {deleted && (
        <p role="status" className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          Your account and its data were deleted. Thanks for hanging out with us.
        </p>
      )}
      {tryGetPublicEnv() ? (
        <>
          <LoginForm next={next} initialError={error} initialEmail={email?.success ? email.data : null} />
          <OAuthButtons providers={enabledOAuthProviders()} next={next} />
        </>
      ) : (
        <ConfigNotice />
      )}
    </div>
  );
}
