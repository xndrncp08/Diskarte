"use client";

import { useMe } from "@/components/providers/MeProvider";
import { useServer } from "@/components/providers/ServerProvider";
import { useCall } from "@/components/voice/CallProvider";
import type { PresencePayload } from "@/lib/presence";
import type { MemberWithProfile } from "@/lib/servers";

/**
 * Who's in a voice channel: everyone else from presence, and you from your own call — instantly and
 * always right (Discord shows you the moment you join, without waiting for presence to echo back).
 */
export function useVoiceRoster(channelId: string): { member: MemberWithProfile; presence: PresencePayload | undefined }[] {
  const { members, presence } = useServer();
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
