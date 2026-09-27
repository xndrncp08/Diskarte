import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { ConfigNotice } from "@/components/ConfigNotice";
import { tryGetPublicEnv } from "@/lib/env";
import { enabledOAuthProviders } from "@/lib/profile";
import { safeRedirectPath } from "@/lib/security";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeRedirectPath(typeof params.next === "string" ? params.next : null);
  const error = typeof params.error === "string" ? params.error.slice(0, 200) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Welcome back, kabayan!</h1>
        <p className="mt-1 text-sm text-slate-400">Tuloy ang tambayan. Mag-log in para bumalik sa barkada.</p>
      </div>
      {tryGetPublicEnv() ? (
        <>
          <LoginForm next={next} initialError={error} />
          <OAuthButtons providers={enabledOAuthProviders()} next={next} />
        </>
      ) : (
        <ConfigNotice />
      )}
    </div>
  );
}
