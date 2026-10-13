"use server";

import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { adminError } from "@/lib/admin";
import { banSchema, broadcastIdSchema, broadcastSchema, roleChangeSchema, statusOverrideSchema, userIdSchema } from "@/lib/schemas/admin";
import { isSuperAdmin } from "@/lib/admin-server";
import { fieldErrors } from "@/lib/profile";
import { fixAgentSchema, reportStatusSchema } from "@/lib/schemas/reports";
import { limiters } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./servers";

/**
 * Control Center mutations. Each one verifies the session and the super admin role on the server
 * before touching the database — and the RPCs check `is_super_admin()` again themselves, so a forged
 * request never gets further than a NOT_AUTHORIZED error.
 */

const DENIED: ActionResult<never> = { ok: false, error: adminError("NOT_AUTHORIZED") };
const RATE_LIMITED: ActionResult<never> = { ok: false, error: adminError("RATE_LIMITED") };

async function guard(): Promise<ActionResult<never> | null> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "You're signed out. Sign in again." };
  if (!limiters.mutation.check(`mutation:${user.id}`).ok) return RATE_LIMITED;
  if (!(await isSuperAdmin())) return DENIED;
  return null;
}

function invalid(error: z.ZodError): ActionResult<never> {
  return { ok: false, fieldErrors: fieldErrors(error), error: error.issues[0]?.message ?? "Check the form and try again." };
}

export async function dispatchBroadcastAction(input: z.input<typeof broadcastSchema>): Promise<ActionResult<{ id: string }>> {
  const denied = await guard();
  if (denied) return denied;
  const parsed = broadcastSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { title, body, tone, targets, sticky, stickyHours } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_dispatch_broadcast", {
    p_title: title,
    p_body: body,
    p_tone: tone,
    p_targets: targets,
    p_sticky: sticky,
    p_sticky_hours: sticky ? stickyHours : null,
  });
  if (error || !data) return { ok: false, error: adminError(error?.message, "The broadcast didn't go out. Try again.") };
  return { ok: true, data: { id: data } };
}

export async function retractBroadcastAction(input: { broadcastId: string }): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const parsed = broadcastIdSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_retract_broadcast", { p_broadcast: parsed.data.broadcastId });
  if (error) return { ok: false, error: adminError(error.message) };
  return { ok: true };
}

export async function setRoleAction(input: { userId: string; role: string }): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const parsed = roleChangeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_role", { p_user: parsed.data.userId, p_role: parsed.data.role });
  if (error) return { ok: false, error: adminError(error.message) };
  return { ok: true };
}

export async function overrideStatusAction(input: { userId: string; status: string; customStatus: string | null }): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const parsed = statusOverrideSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_status", {
    p_user: parsed.data.userId,
    p_status: parsed.data.status,
    p_custom_status: parsed.data.customStatus || null,
  });
  if (error) return { ok: false, error: adminError(error.message) };
  return { ok: true };
}

export async function revokeSessionsAction(input: { userId: string }): Promise<ActionResult<{ sessions: number }>> {
  const denied = await guard();
  if (denied) return denied;
  const parsed = userIdSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_revoke_sessions", { p_user: parsed.data.userId });
  if (error) return { ok: false, error: adminError(error.message) };
  return { ok: true, data: { sessions: data ?? 0 } };
}

export async function banUserAction(input: { userId: string; hours: number | null; reason: string }): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const parsed = banSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_ban_user", { p_user: parsed.data.userId, p_hours: parsed.data.hours, p_reason: parsed.data.reason || null });
  if (error) return { ok: false, error: adminError(error.message) };
  return { ok: true };
}

export async function unbanUserAction(input: { userId: string }): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const parsed = userIdSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_unban_user", { p_user: parsed.data.userId });
  if (error) return { ok: false, error: adminError(error.message) };
  return { ok: true };
}

export async function setReportStatusAction(input: z.input<typeof reportStatusSchema>): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  const parsed = reportStatusSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_report_status", { p_report: parsed.data.reportId, p_status: parsed.data.status });
  if (error) return { ok: false, error: adminError(error.message) };
  return { ok: true };
}

/**
 * Hands a report to the fix agent: opens a GitHub issue labelled `autofix` (which starts
 * .github/workflows/fix-agent.yml) and marks the report sent. The admin reviews the text first;
 * the issue is public.
 */
export async function sendToFixAgentAction(input: z.input<typeof fixAgentSchema>): Promise<ActionResult<{ issueUrl: string }>> {
  const denied = await guard();
  if (denied) return denied;
  const parsed = fixAgentSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const token = process.env.GITHUB_FIX_AGENT_TOKEN;
  const repo = process.env.GITHUB_REPO ?? "xndrncp08/Diskarte";
  if (!token) return { ok: false, error: "The fix agent isn't set up: add GITHUB_FIX_AGENT_TOKEN to the deployment." };

  let issueUrl: string;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      body: JSON.stringify({ title: parsed.data.title, body: parsed.data.body, labels: ["autofix"] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, error: `GitHub refused the issue (${res.status}). Check the token's Issues permission.` };
    issueUrl = ((await res.json()) as { html_url: string }).html_url;
  } catch {
    return { ok: false, error: "Couldn't reach GitHub. Try again." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_report_status", { p_report: parsed.data.reportId, p_status: "sent", p_issue_url: issueUrl });
  // The issue exists either way; say so rather than inviting a duplicate.
  if (error) return { ok: false, error: `Issue opened (${issueUrl}) but the report wasn't marked sent: ${adminError(error.message)}` };
  return { ok: true, data: { issueUrl } };
}
