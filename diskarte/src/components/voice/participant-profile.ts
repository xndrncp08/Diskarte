"use client";

import type { Participant } from "livekit-client";
import { useOptionalServer } from "@/components/providers/ServerProvider";
import type { AvatarProfile } from "@/components/profile/UserAvatar";
import type { MemberWithProfile } from "@/lib/servers";

export type ParticipantProfile = AvatarProfile & { name: string };

/** A participant (identity = user id) as a profile: Tambayan members first, token metadata second. No LiveKit UI import,
    so the live strip can use it without loading the call stage. */
export function participantProfile(participant: Participant, members: readonly MemberWithProfile[] = []): ParticipantProfile {
  const member = members.find((m) => m.user_id === participant.identity);
  if (member) return { ...member.profile, name: member.nickname ?? member.profile.display_name };
  let meta: { avatar_url?: string | null; avatar_preset?: string } = {};
  try {
    meta = participant.metadata ? JSON.parse(participant.metadata) : {};
  } catch {
    meta = {};
  }
  const name = participant.name || participant.identity;
  return { display_name: name, name, avatar_url: meta.avatar_url ?? null, avatar_preset: meta.avatar_preset ?? "araw" };
}

export function useParticipantProfile(participant: Participant): ParticipantProfile {
  return participantProfile(participant, useOptionalServer()?.members);
}
