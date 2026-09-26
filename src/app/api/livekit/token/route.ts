import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getPublicEnv, getServerEnv, MissingEnvError } from "@/lib/env";
import { mintVoiceToken, voiceRoomName } from "@/lib/livekit";
import { limiters } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({ channelId: z.uuid() });

const noStore = { "Cache-Control": "no-store" };

/**
 * POST /api/livekit/token { channelId }
 * Verifies the Supabase session, that the channel is a voice channel, and (through RLS) that the
 * caller is a member of its Tambayan — only then mints a room-scoped LiveKit token.
 * CSRF: proxy.ts rejects cross-origin POSTs to /api/*.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401, headers: noStore });

  const limit = limiters.voiceToken.check(`voice:${user.id}`);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many voice join attempts" },
      { status: 429, headers: { ...noStore, "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid channel" }, { status: 400, headers: noStore });

  // RLS returns the channel only if the user is a member of its server.
  const { data: channel } = await supabase.from("channels").select("id, type, server_id").eq("id", parsed.data.channelId).maybeSingle();
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404, headers: noStore });
  if (channel.type !== "voice") return NextResponse.json({ error: "Not a voice channel" }, { status: 400, headers: noStore });

  const { data: profile } = await supabase.from("profiles").select("display_name, username, avatar_url, avatar_preset").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile missing" }, { status: 403, headers: noStore });

  try {
    const { livekitApiKey, livekitApiSecret } = getServerEnv();
    const { livekitUrl } = getPublicEnv();
    const token = await mintVoiceToken({
      apiKey: livekitApiKey,
      apiSecret: livekitApiSecret,
      channelId: channel.id,
      identity: { userId: user.id, displayName: profile.display_name, username: profile.username, avatarUrl: profile.avatar_url, avatarPreset: profile.avatar_preset },
    });
    return NextResponse.json({ token, url: livekitUrl, room: voiceRoomName(channel.id) }, { headers: noStore });
  } catch (err) {
    if (err instanceof MissingEnvError) return NextResponse.json({ error: "Voice is not configured on this server" }, { status: 503, headers: noStore });
    throw err;
  }
}
