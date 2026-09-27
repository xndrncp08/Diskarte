"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { approveApplications, declineApplications, resendCredentials, type ApprovalDeps, type ApprovalOutcome, type WaitlistRow } from "@/lib/approvals";
import { createMailer } from "@/lib/email/send";
import { getApprovalEnv, getPortalEnv, MissingEnvError } from "@/lib/env";
import { adminNoteSchema, declineReasonSchema, reviewIdsSchema } from "@/lib/schema";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient, getSuperAdmin, type ServerSupabase } from "@/lib/supabase/server";

export interface ReviewResult {
  ok: boolean;
  message: string;
  outcomes?: ApprovalOutcome[];
}

const NOT_ADMIN: ReviewResult = { ok: false, message: "Session expired o walang admin access. Mag-login ulit." };

/**
 * Every review action re-verifies the caller in the database (proxy.ts already did for the page,
 * but Server Actions are separately addressable endpoints).
 */
async function requireSuperAdmin(): Promise<ServerSupabase | null> {
  const supabase = await createClient();
  return (await getSuperAdmin(supabase)) ? supabase : null;
}

/** Admin-scoped (RLS) access to applications: only super admins can read or update rows. */
function rlsDb(supabase: ServerSupabase): ApprovalDeps["db"] {
  return {
    async load(ids) {
      const { data, error } = await supabase.from("waitlist_applications").select("*").in("id", ids);
      if (error) throw new Error(error.message);
      return (data ?? []) as WaitlistRow[];
    },
    async markApproved(id, userId) {
      const { data, error } = await supabase.from("waitlist_applications").update({ status: "approved", approved_user_id: userId }).eq("id", id).select("id");
      if (error || !data?.length) throw new Error(error?.message ?? "not updated");
    },
    async markDeclined(ids, reason) {
      const { data, error } = await supabase.from("waitlist_applications").update({ status: "declined", decline_reason: reason }).in("id", ids).neq("status", "approved").select("id");
      if (error) throw new Error(error.message);
      return data?.length ?? 0;
    },
    async recordEmail(id, result) {
      await supabase.from("waitlist_applications").update({ email_sent_at: result.sentAt, email_error: result.error, email_attempts: result.attempts }).eq("id", id);
    },
  };
}

/** Wires the approval workflow to Supabase: RLS-scoped reads/writes as the admin, Auth via service role. */
function liveDeps(supabase: ServerSupabase): ApprovalDeps {
  const env = getPortalEnv();
  const approvalEnv = getApprovalEnv();
  const service = createServiceClient();
  return {
    db: rlsDb(supabase),
    auth: {
      async createUser({ email, password, metadata }) {
        const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: metadata });
        if (error) {
          if (error.code === "email_exists" || /already (been )?registered/i.test(error.message)) return { exists: true };
          throw new Error(error.message);
        }
        return { id: data.user.id };
      },
      async resetPassword(userId, password) {
        const { error } = await service.auth.admin.updateUserById(userId, { password, user_metadata: { must_change_password: true } });
        if (error) throw new Error(error.message);
      },
    },
    mail: createMailer(approvalEnv.email),
    urls: { login: `${env.appUrl}/login`, assets: env.siteUrl },
  };
}

function summarise(outcomes: ApprovalOutcome[]): ReviewResult {
  const approved = outcomes.filter((o) => o.result === "approved");
  const failed = outcomes.filter((o) => o.result === "failed");
  const unsent = approved.filter((o) => o.result === "approved" && !o.emailed);
  const parts = [`${approved.length} approved`];
  if (unsent.length) parts.push(`${unsent.length} email hindi na-send (i-resend)`);
  if (failed.length) parts.push(`${failed.length} failed`);
  return { ok: failed.length === 0 && unsent.length === 0, message: parts.join(" · "), outcomes };
}

export async function approveAction(ids: string[]): Promise<ReviewResult> {
  const supabase = await requireSuperAdmin();
  if (!supabase) return NOT_ADMIN;
  const parsed = reviewIdsSchema.safeParse(ids);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid selection" };
  try {
    const outcomes = await approveApplications(parsed.data, liveDeps(supabase));
    revalidatePath("/admin");
    return summarise(outcomes);
  } catch (err) {
    if (err instanceof MissingEnvError) return { ok: false, message: `Hindi naka-configure ang approvals: ${err.message}` };
    throw err;
  }
}

export async function declineAction(ids: string[], reason: string): Promise<ReviewResult> {
  const supabase = await requireSuperAdmin();
  if (!supabase) return NOT_ADMIN;
  const parsedIds = reviewIdsSchema.safeParse(ids);
  const parsedReason = declineReasonSchema.safeParse(reason ?? "");
  if (!parsedIds.success || !parsedReason.success) return { ok: false, message: "Invalid selection o reason." };
  const count = await declineApplications(parsedIds.data, parsedReason.data, { db: rlsDb(supabase) });
  revalidatePath("/admin");
  return { ok: true, message: `${count} declined` };
}

export async function reopenAction(id: string): Promise<ReviewResult> {
  const supabase = await requireSuperAdmin();
  if (!supabase) return NOT_ADMIN;
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid application" };
  const { data, error } = await supabase.from("waitlist_applications").update({ status: "pending" }).eq("id", id).eq("status", "declined").select("id");
  if (error || !data?.length) return { ok: false, message: "Declined applications lang ang pwedeng ibalik sa pila." };
  revalidatePath("/admin");
  return { ok: true, message: "Ibinalik sa pending." };
}

export async function resendAction(id: string): Promise<ReviewResult> {
  const supabase = await requireSuperAdmin();
  if (!supabase) return NOT_ADMIN;
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid application" };
  try {
    const result = await resendCredentials(id, liveDeps(supabase));
    revalidatePath("/admin");
    return result.emailed ? { ok: true, message: "Na-send ulit ang welcome email (bagong temporary password)." } : { ok: false, message: result.error ?? "Hindi na-send." };
  } catch (err) {
    if (err instanceof MissingEnvError) return { ok: false, message: `Hindi naka-configure ang approvals: ${err.message}` };
    throw err;
  }
}

export async function saveNoteAction(id: string, note: string): Promise<ReviewResult> {
  const supabase = await requireSuperAdmin();
  if (!supabase) return NOT_ADMIN;
  const parsed = adminNoteSchema.safeParse(note ?? "");
  if (!z.uuid().safeParse(id).success || !parsed.success) return { ok: false, message: "Invalid note" };
  const { error } = await supabase.from("waitlist_applications").update({ admin_note: parsed.data }).eq("id", id);
  if (error) return { ok: false, message: "Hindi na-save ang note." };
  revalidatePath("/admin");
  return { ok: true, message: "Na-save ang note." };
}
