"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { communityError } from "@/lib/community";
import { limiters } from "@/lib/rate-limit";
import type { RingStatus } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./servers";

const RATE_LIMITED: ActionResult<never> = { ok: false, error: "Slow down a little. Try again in a moment.", code: "RATE_LIMITED" };

async function authed() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return { limited: !limiters.mutation.check(`mutation:${user.id}`).ok };
}

function ringError(message: string | undefined) {
  if (message?.includes("RATE_LIMITED")) return "You're ringing too often. Try again in a minute.";
  if (message?.includes("CANNOT_RING")) return "You can't ring that person.";
  if (message?.includes("NOT_A_VOICE_CHANNEL")) return "Pick a voice channel to ring someone into.";
  if (message?.includes("RING_NOT_FOUND")) return "That call isn't ringing anymore.";
  return communityError(message, "Couldn't ring. Try again.");
}

const ringSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("dm"), conversationId: z.uuid(), video: z.boolean().default(false) }),
  z.object({ kind: z.literal("voice"), channelId: z.uuid(), calleeId: z.uuid() }),
]);

/** Ring the other people in a DM (starting a DM call), or ping one member into a voice channel. */
export async function ringAction(input: z.input<typeof ringSchema>): Promise<ActionResult<{ rang: number }>> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const parsed = ringSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid call" };
  const supabase = await createClient();
  const args =
    parsed.data.kind === "dm"
      ? { p_kind: "dm" as const, p_target: parsed.data.conversationId, p_video: parsed.data.video }
      : { p_kind: "voice" as const, p_target: parsed.data.channelId, p_callee: parsed.data.calleeId };
  const { data, error } = await supabase.rpc("ring_call", args);
  if (error) return { ok: false, error: ringError(error.message) };
  return { ok: true, data: { rang: Array.isArray(data) ? data.length : 0 } };
}

export async function respondRingAction(input: { ringId: string; accept: boolean }): Promise<ActionResult<{ status: RingStatus }>> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  if (!z.uuid().safeParse(input.ringId).success) return { ok: false, error: "Invalid call" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("respond_ring", { p_ring: input.ringId, p_accept: input.accept === true });
  if (error) return { ok: false, error: ringError(error.message) };
  return { ok: true, data: { status: data as RingStatus } };
}

/** The caller hung up (or switched calls) before anyone answered. */
export async function cancelRingsAction(input: { target: string }): Promise<ActionResult> {
  await authed();
  if (!z.uuid().safeParse(input.target).success) return { ok: false, error: "Invalid call" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_rings", { p_target: input.target });
  return error ? { ok: false, error: ringError(error.message) } : { ok: true };
}
