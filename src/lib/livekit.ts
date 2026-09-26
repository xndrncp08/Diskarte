import "server-only";
import { AccessToken, TrackSource } from "livekit-server-sdk";

/**
 * Tokens only gate *joining* (and reconnecting within the hour); LiveKit refreshes credentials for
 * connected participants itself, so long calls keep working with a short TTL.
 */
export const VOICE_TOKEN_TTL_SECONDS = 60 * 60;

export function voiceRoomName(channelId: string) {
  return `voice:${channelId}`;
}

export interface VoiceIdentity {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  avatarPreset: string;
}

/**
 * Mint a short-lived LiveKit token scoped to exactly one voice room. Identity = Supabase user id,
 * so other clients can map participants back to Tambayan members. Only mic/camera/screen may be
 * published and participants cannot rewrite their own metadata.
 */
export async function mintVoiceToken(opts: { apiKey: string; apiSecret: string; channelId: string; identity: VoiceIdentity }) {
  const token = new AccessToken(opts.apiKey, opts.apiSecret, {
    identity: opts.identity.userId,
    name: opts.identity.displayName,
    ttl: VOICE_TOKEN_TTL_SECONDS,
    metadata: JSON.stringify({
      username: opts.identity.username,
      avatar_url: opts.identity.avatarUrl,
      avatar_preset: opts.identity.avatarPreset,
    }),
  });
  token.addGrant({
    room: voiceRoomName(opts.channelId),
    roomJoin: true,
    canSubscribe: true,
    canPublish: true,
    canPublishData: true,
    canUpdateOwnMetadata: false,
    canPublishSources: [TrackSource.MICROPHONE, TrackSource.CAMERA, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
  });
  return token.toJwt();
}
