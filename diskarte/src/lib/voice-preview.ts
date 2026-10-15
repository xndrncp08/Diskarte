import type { ProfileCardData } from "@/components/profile/ProfileCard";
export interface PreviewParticipant { id: string; profile: ProfileCardData; muted: boolean; screen: boolean }
export interface PreviewChannel { id: string; name: string; count: number; participants: PreviewParticipant[]; streamers: { id: string; name: string }[] }
export interface VoicePreview { channels: PreviewChannel[]; limited: boolean }
