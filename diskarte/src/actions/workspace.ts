"use server";

import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { limiters } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { workspaceContent, type WorkspaceDocument } from "@/lib/workspace-documents";
import type { ActionResult } from "./servers";

const schema = z.object({ channelId: z.uuid(), kind: z.enum(["note", "board", "focus"]), title: z.string().trim().min(1).max(100), content: z.unknown(), id: z.uuid().optional(), revision: z.number().int().nonnegative().default(0), timer: z.enum(["start", "reset"]).optional() });
const errorFor = (message: string) => message.includes("WORKSPACE_CONFLICT") ? "Someone updated this item. Your changes are preserved; review the latest version before saving." : message.includes("WORKSPACE_LIMIT") ? "This channel already has 50 workspace items." : "You couldn’t save this item. Check your connection and channel permissions.";

export async function saveWorkspaceAction(input: z.input<typeof schema>): Promise<ActionResult<WorkspaceDocument>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in again to save." };
  if (!limiters.mutation.check(`workspace:${user.id}`).ok) return { ok: false, error: "Slow down a little before saving again." };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the item’s name and content." };
  const content = workspaceContent(parsed.data.kind, parsed.data.content);
  if (!content.success) return { ok: false, error: "The item’s content is invalid or too large." };
  const supabase = await createClient();
  const v = parsed.data;
  const { data, error } = await supabase.rpc("save_workspace_document", { p_channel: v.channelId, p_kind: v.kind, p_title: v.title, p_content: content.data, p_id: v.id, p_revision: v.revision, p_timer: v.timer });
  if (error || !data?.[0]) return { ok: false, error: errorFor(error?.message ?? ""), code: error?.message.includes("WORKSPACE_CONFLICT") ? "CONFLICT" : undefined };
  return { ok: true, data: data[0] };
}
export async function deleteWorkspaceAction(input: { id: string; revision: number }): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in again to delete." };
  if (!limiters.mutation.check(`workspace:${user.id}`).ok) return { ok: false, error: "Slow down a little." };
  const parsed = schema.pick({ id: true, revision: true }).required().safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid item." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_workspace_document", { p_id: parsed.data.id, p_revision: parsed.data.revision });
  return error ? { ok: false, error: errorFor(error.message) } : { ok: true };
}
