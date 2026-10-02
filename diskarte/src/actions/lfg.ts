"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { communityError, lfgSchema } from "@/lib/community";
import { fieldErrors } from "@/lib/profile";
import { limiters } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./servers";

const RATE_LIMITED: ActionResult<never> = { ok: false, error: "Slow down a little. Try again in a moment." };

async function authed() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return { limited: !limiters.mutation.check(`mutation:${user.id}`).ok };
}

const beaconId = z.object({ beaconId: z.uuid() });

export async function createLfgAction(input: {
  serverId: string;
  game: string;
  description: string;
  partySize: number | string;
  durationMinutes: number | string;
  voiceChannelId: string;
}): Promise<ActionResult<{ beaconId: string }>> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const server = z.object({ serverId: z.uuid() }).safeParse(input);
  const parsed = lfgSchema.safeParse(input);
  if (!server.success) return { ok: false, error: "Invalid server" };
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_lfg", {
    p_server_id: server.data.serverId,
    p_game: parsed.data.game,
    p_description: parsed.data.description,
    p_party_size: parsed.data.partySize,
    p_voice_channel_id: parsed.data.voiceChannelId,
    p_duration_minutes: parsed.data.durationMinutes,
  });
  if (error || !data) return { ok: false, error: communityError(error?.message, "Couldn't start the beacon.") };
  return { ok: true, data: { beaconId: data } };
}

/** 1-click "Join Party": returns the beacon's voice channel so the client can hop straight in. */
export async function joinLfgAction(input: { beaconId: string }): Promise<ActionResult<{ voiceChannelId: string | null }>> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const parsed = beaconId.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid beacon" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_lfg", { p_beacon_id: parsed.data.beaconId });
  if (error) return { ok: false, error: communityError(error.message, "Couldn't join the party.") };
  return { ok: true, data: { voiceChannelId: data ?? null } };
}

export async function leaveLfgAction(input: { beaconId: string }): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const parsed = beaconId.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid beacon" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_lfg", { p_beacon_id: parsed.data.beaconId });
  if (error) return { ok: false, error: communityError(error.message) };
  return { ok: true };
}

export async function closeLfgAction(input: { beaconId: string }): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const parsed = beaconId.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid beacon" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_lfg", { p_beacon_id: parsed.data.beaconId });
  if (error) return { ok: false, error: communityError(error.message, "Couldn't close the beacon.") };
  return { ok: true };
}
