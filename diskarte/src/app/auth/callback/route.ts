import { NextResponse, type NextRequest } from "next/server";
import { friendlyAuthError } from "@/lib/auth-errors";
import { getPublicEnv } from "@/lib/env";
import { safeRedirectPath } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";

/** OAuth + email-link landing: exchanges the PKCE `code` for a session cookie, then redirects. */
export async function GET(request: NextRequest) {
  const { siteUrl } = getPublicEnv();
  const params = request.nextUrl.searchParams;
  const next = safeRedirectPath(params.get("next"));
  const code = params.get("code");
  const providerError = params.get("error_description") ?? params.get("error");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, siteUrl));
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(friendlyAuthError(error.message))}`, siteUrl));
  }

  const message = providerError ? friendlyAuthError(providerError) : "That sign-in link is invalid or has expired.";
  return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, siteUrl));
}
