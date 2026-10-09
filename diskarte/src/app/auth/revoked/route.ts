import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "@/lib/env";
import { safeRedirectPath } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";

const SESSION_ENDED = "Your session ended. Sign in again to continue.";

/**
 * Where protected pages send a visitor whose cookie still holds a signed token but whose session the
 * auth server no longer accepts (revoked in the Control Center, banned, or deleted). The proxy only
 * verifies the token's signature, so without clearing the cookie here /login would bounce back to
 * the app. Plain signed-out visitors pass straight through to /login.
 */
export async function GET(request: NextRequest) {
  const { siteUrl } = getPublicEnv();
  const next = safeRedirectPath(request.nextUrl.searchParams.get("next"));
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const target = new URL("/login", siteUrl);
  target.searchParams.set("next", next);
  if (data?.claims) {
    await supabase.auth.signOut({ scope: "local" });
    target.searchParams.set("error", SESSION_ENDED);
  }
  return NextResponse.redirect(target);
}
