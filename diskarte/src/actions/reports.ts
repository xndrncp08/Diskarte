"use server";

import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { fieldErrors } from "@/lib/profile";
import { limiters } from "@/lib/rate-limit";
import { reportSchema } from "@/lib/schemas/reports";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./servers";

/** Anyone signed in can report a problem; the database caps it at five an hour per person. */
export async function submitReportAction(input: z.input<typeof reportSchema>): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "You're signed out. Sign in again." };
  if (!limiters.mutation.check(`mutation:${user.id}`).ok) return { ok: false, error: "Slow down a little and try again." };
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error), error: parsed.error.issues[0]?.message };
  const { category, description, pageUrl, userAgent } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("problem_reports").insert({ category, description, page_url: pageUrl, user_agent: userAgent });
  if (error?.message.includes("REPORT_RATE_LIMITED")) return { ok: false, error: "You've sent a lot of reports this hour. We're on it. Try again later." };
  if (error) return { ok: false, error: "Your report didn't go through. Try again." };
  return { ok: true };
}
