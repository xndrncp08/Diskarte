"use server";

import { headers } from "next/headers";
import { checkFormToken, hashIp, honeypotTripped, HONEYPOT_FIELD } from "@/lib/antispam";
import { getPortalEnv } from "@/lib/env";
import { clientIp, limiter } from "@/lib/rate-limit";
import { applicationSchema, fieldErrors } from "@/lib/schema";
import { createClient } from "@/lib/supabase/server";
import { TURNSTILE_FIELD, verifyTurnstile } from "@/lib/turnstile";

export interface ApplyState {
  status: "idle" | "error" | "success";
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  firstName?: string;
}

const KEEP = ["fullName", "email", "preferredUsername", "communityType", "communityName", "communitySize", "referralSource", "reason"] as const;

function text(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

/**
 * Public waitlist submission. Layers, cheapest first: per-IP limit → honeypot → signed timing
 * token → Turnstile (when configured) → Zod → insert through RLS (anon role, applicant columns
 * only) → DB triggers (normalisation, per-IP-hash and global flood caps, unique email).
 */
export async function submitApplicationAction(_prev: ApplyState, form: FormData): Promise<ApplyState> {
  const env = getPortalEnv();
  const h = await headers();
  const ip = clientIp(h);
  const values = Object.fromEntries(KEEP.map((k) => [k, text(form, k)]));

  if (!limiter("apply", env.limits.applyPerHour, 60 * 60 * 1000).check(ip).ok) {
    return { status: "error", error: "Ang dami nang applications mula sa network mo. Subukan ulit mamaya.", values };
  }

  // Bots that fill every field get a convincing success and nothing is stored.
  if (honeypotTripped(form.get(HONEYPOT_FIELD))) return { status: "success", firstName: "kabayan" };

  const tokenProblem = checkFormToken(form.get("formToken"), env.secret);
  if (tokenProblem === "too_fast") return { status: "error", error: "Ang bilis mo naman! Basahin muna ang form bago mag-submit. 😉", values };
  if (tokenProblem) return { status: "error", error: "Na-expire ang form. I-refresh ang page at subukan ulit.", values };

  if (env.turnstile && !(await verifyTurnstile(form.get(TURNSTILE_FIELD), { secretKey: env.turnstile.secretKey, ip }))) {
    return { status: "error", error: "Hindi na-verify na tao ka. Subukan ulit ang CAPTCHA.", values };
  }

  const parsed = applicationSchema.safeParse({ ...values, consent: form.get("consent") });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error), values };
  const a = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("waitlist_applications").insert({
    full_name: a.fullName,
    email: a.email,
    preferred_username: a.preferredUsername,
    community_type: a.communityType,
    community_name: a.communityName,
    community_size: a.communitySize,
    referral_source: a.referralSource,
    reason: a.reason,
    ip_hash: hashIp(ip, env.secret),
    user_agent: (h.get("user-agent") ?? "").slice(0, 300) || null,
  });

  const firstName = a.fullName.split(" ")[0];
  if (!error) return { status: "success", firstName };
  // Same answer for "already applied" so the form can't be used to check who's on the list.
  if (error.code === "23505") return { status: "success", firstName };
  if (error.message.includes("TOO_MANY_APPLICATIONS") || error.message.includes("WAITLIST_BUSY")) {
    return { status: "error", error: "Ang daming nag-a-apply ngayon! Subukan ulit after ilang minuto.", values };
  }
  console.error("[early-access] insert failed", error.code, error.message);
  return { status: "error", error: "May nangyaring mali sa pag-save. Subukan ulit.", values };
}
