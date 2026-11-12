"use client";

import { useMe } from "@/components/providers/MeProvider";
import { useTopicPresence, voiceTopic } from "@/components/providers/PresenceProvider";
import { useOptionalServer, useServer } from "@/components/providers/ServerProvider";
import { useCall } from "@/components/voice/CallProvider";
import type { PresencePayload } from "@/lib/presence";
import type { MemberWithProfile } from "@/lib/servers";

const NOBODY = new Map<string, PresencePayload>();

/**
 * The presence map that may describe a voice channel: a private channel's own `voice:<id>` topic, never the
 * server-wide one (where private occupancy is never published); a public channel's server presence. Empty outside a
 * Tambayan (DM calls) or for a channel RLS didn't return.
 */
export function useChannelVoicePresence(channelId: string | null | undefined): Map<string, PresencePayload> {
  const server = useOptionalServer();
  const channel = server?.channels.find((c) => c.id === channelId);
  const privatePresence = useTopicPresence(channel?.is_private ? voiceTopic(channel.id) : null);
  return !channel ? NOBODY : channel.is_private ? privatePresence : (server?.presence ?? NOBODY);
}

/**
 * Who's in a voice channel: everyone else from presence, and you from your own call — instantly and
 * always right (Discord shows you the moment you join, without waiting for presence to echo back).
 * A private channel's occupants come from its own `voice:<id>` topic, never the server-wide one.
 */
export function useVoiceRoster(channelId: string): { member: MemberWithProfile; presence: PresencePayload | undefined }[] {
  const { members } = useServer();
  const presence = useChannelVoicePresence(channelId);
  const { me } = useMe();
  const call = useCall();
  const here = (call.status === "connected" || call.status === "reconnecting") && call.target?.channelId === channelId;
  return members.flatMap((member) => {
    const p = presence.get(member.user_id);
    if (member.user_id !== me.id) return p?.voice_channel_id === channelId ? [{ member, presence: p }] : [];
    if (!here) return [];
    const mine: PresencePayload = {
      user_id: me.id,
      status: me.status,
      custom_status: me.custom_status,
      custom_status_emoji: me.custom_status_emoji,
      online_at: p?.online_at ?? new Date(0).toISOString(),
      voice_channel_id: channelId,
      muted: call.muted,
      deafened: call.deafened,
      video: call.camera,
      screen: call.screen,
    };
    return [{ member, presence: mine }];
  });
}
