"use server";

import { RoomServiceClient, TrackSource } from "livekit-server-sdk";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { getPublicEnv, getServerEnv } from "@/lib/env";
import { voiceRoomName } from "@/lib/livekit";
import { limiters } from "@/lib/rate-limit";
import { canManageMember } from "@/lib/servers";
import { uuidSchema } from "@/lib/schemas/servers";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/lib/supabase/database.types";

export interface VoiceActionResult {
  ok: boolean;
  error?: string;
}

const ALL_SOURCES = [TrackSource.MICROPHONE, TrackSource.CAMERA, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO];

const schema = z.object({
  channelId: uuidSchema,
  userId: uuidSchema,
  action: z.enum(["mute", "unmute", "deafen", "undeafen", "disconnect", "move"]),
  toChannelId: uuidSchema.optional(),
});

/**
 * Discord's voice moderation for someone in a server voice channel: Server Mute / Deafen (they can't
 * talk / hear until it's lifted or they leave), Disconnect, and Move to another voice channel.
 * Moderators only, and only on members they outrank (the same rule as kicking).
 */
export async function moderateVoiceAction(input: z.input<typeof schema>): Promise<VoiceActionResult> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!limiters.mutation.check(`mutation:${user.id}`).ok) return { ok: false, error: "Slow down a little. Try again in a moment." };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const { channelId, userId, action, toChannelId } = parsed.data;

  const supabase = await createClient();
  const { data: channel } = await supabase.from("channels").select("id, server_id, type").eq("id", channelId).maybeSingle();
  if (!channel || channel.type !== "voice") return { ok: false, error: "That voice channel is gone." };
  const [{ data: server }, { data: people }] = await Promise.all([
    supabase.from("servers").select("owner_id").eq("id", channel.server_id).maybeSingle(),
    supabase.from("members").select("user_id, role").eq("server_id", channel.server_id).in("user_id", [user.id, userId]),
  ]);
  const me = people?.find((m) => m.user_id === user.id);
  const target = people?.find((m) => m.user_id === userId);
  if (!me || !target) return { ok: false, error: "They're not in this server." };
  const allowed = canManageMember({ actorRole: me.role as MemberRole, actorId: user.id, target: { role: target.role as MemberRole, user_id: userId }, ownerId: server?.owner_id ?? null }).kick;
  if (!allowed) return { ok: false, error: "You can only do that to members below you." };

  let destination: string | null = null;
  if (action === "move") {
    if (!toChannelId || toChannelId === channelId) return { ok: false, error: "Pick another voice channel." };
    const { data: to } = await supabase.from("channels").select("*").eq("id", toChannelId).maybeSingle();
    // Private channels check access per person, which we can't do on their behalf here.
    if (!to || to.server_id !== channel.server_id || to.type !== "voice" || to.is_private === true) return { ok: false, error: "You can't move them there." };
    destination = voiceRoomName(to.id);
  }

  const { livekitUrl } = getPublicEnv();
  const { livekitApiKey, livekitApiSecret } = getServerEnv();
  const rooms = new RoomServiceClient(livekitUrl.replace(/^ws/, "http"), livekitApiKey, livekitApiSecret);
  const room = voiceRoomName(channelId);
  try {
    if (action === "disconnect") {
      await rooms.removeParticipant(room, userId);
      return { ok: true };
    }
    if (destination) {
      await rooms.moveParticipant(room, userId, destination);
      return { ok: true };
    }
    const info = await rooms.getParticipant(room, userId);
    const sources = info.permission?.canPublishSources?.length ? info.permission.canPublishSources : ALL_SOURCES;
    const canSubscribe = info.permission?.canSubscribe ?? true;
    if (action === "mute") {
      for (const t of info.tracks) if (t.source === TrackSource.MICROPHONE && !t.muted) await rooms.mutePublishedTrack(room, userId, t.sid, true);
    }
    await rooms.updateParticipant(room, userId, undefined, {
      canPublish: true,
      canPublishData: true,
      canSubscribe: action === "deafen" ? false : action === "undeafen" ? true : canSubscribe,
      canPublishSources:
        action === "mute" ? sources.filter((s) => s !== TrackSource.MICROPHONE) : action === "unmute" ? Array.from(new Set([...sources, TrackSource.MICROPHONE])) : sources,
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "They're not in that voice channel any more." };
  }
}
