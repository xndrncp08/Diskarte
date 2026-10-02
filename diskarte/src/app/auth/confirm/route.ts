import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "@/lib/env";
import { safeRedirectPath } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/** Token-hash email confirmation (for Supabase email templates using {{ .TokenHash }}). */
export async function GET(request: NextRequest) {
  const { siteUrl } = getPublicEnv();
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const next = safeRedirectPath(params.get("next"), "/onboarding");

  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, siteUrl));
  }
  return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent("That confirmation link is invalid or has expired.")}`, siteUrl));
}
