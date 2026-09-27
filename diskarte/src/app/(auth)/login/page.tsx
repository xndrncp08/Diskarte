import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { ConfigNotice } from "@/components/ConfigNotice";
import { tryGetPublicEnv } from "@/lib/env";
import { enabledOAuthProviders } from "@/lib/profile";
import { emailSchema } from "@/lib/profile";
import { safeRedirectPath } from "@/lib/security";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeRedirectPath(typeof params.next === "string" ? params.next : null);
  const error = typeof params.error === "string" ? params.error.slice(0, 200) : null;
  // Arriving from the Early Access approval email (or the portal): greet them and pre-fill the
  // address the credentials were sent to. Only a syntactically valid email is ever echoed back.
  const fromEarlyAccess = params.from === "early-access";
  const email = typeof params.email === "string" ? emailSchema.safeParse(params.email) : null;

  return (
    <div className="space-y-6">
      {fromEarlyAccess ? (
        <div data-testid="early-access-welcome">
          <p className="font-pixel text-[9px] text-sun">EARLY ACCESS · APPROVED</p>
          <h1 className="mt-2 text-2xl font-extrabold text-white">Maligayang pagdating sa Diskarte!</h1>
          <p className="mt-1 text-sm text-slate-400">
            Gamitin ang email at temporary password mula sa welcome email mo. Pagkatapos, gagawa ka ng sariling password.
          </p>
        </div>
      ) : (
        <div>
          <h1 className="text-2xl font-extrabold text-white">Welcome back, kabayan!</h1>
          <p className="mt-1 text-sm text-slate-400">Tuloy ang tambayan. Mag-log in para bumalik sa barkada.</p>
        </div>
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
