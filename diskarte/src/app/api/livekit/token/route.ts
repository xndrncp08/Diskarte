import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getPublicEnv, getServerEnv, MissingEnvError } from "@/lib/env";
import { dmRoomName, mintVoiceToken, voiceRoomName } from "@/lib/livekit";
import { limiters } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.union([z.object({ channelId: z.uuid() }).strict(), z.object({ conversationId: z.uuid() }).strict()]);

const noStore = { "Cache-Control": "no-store" };

/**
 * POST /api/livekit/token { channelId } | { conversationId }
 * Verifies the Supabase session and that the caller may be in the room — a member of the voice
 * channel's Tambayan, or a participant of the DM conversation (RLS + an explicit check) — and only
 * then mints a 1-hour, room-scoped LiveKit token. The API secret never leaves the server
 * (lib/livekit.ts is `server-only`). CSRF: proxy.ts rejects cross-origin POSTs to /api/*.
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

  let room: string;
  if ("conversationId" in parsed.data) {
    // RLS returns the conversation only to its participants; then check the row explicitly too.
    const { conversationId } = parsed.data;
    const { data: conversation } = await supabase.from("dm_conversations").select("id").eq("id", conversationId).maybeSingle();
    if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404, headers: noStore });
    const { data: participant } = await supabase.from("dm_participants").select("user_id").eq("conversation_id", conversationId).eq("user_id", user.id).maybeSingle();
    if (!participant) return NextResponse.json({ error: "Not part of this conversation" }, { status: 403, headers: noStore });
    room = dmRoomName(conversationId);
  } else {
    // RLS returns the channel only if the user is a member of its server.
    const { data: channel } = await supabase.from("channels").select("id, type, server_id").eq("id", parsed.data.channelId).maybeSingle();
    if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404, headers: noStore });
    if (channel.type !== "voice") return NextResponse.json({ error: "Not a voice channel" }, { status: 400, headers: noStore });

    // Defence in depth: an explicit membership row, not just the RLS-filtered channel read.
    const { data: membership } = await supabase.from("members").select("role").eq("server_id", channel.server_id).eq("user_id", user.id).maybeSingle();
    if (!membership) return NextResponse.json({ error: "Not a member of this server" }, { status: 403, headers: noStore });
    room = voiceRoomName(channel.id);
  }

  const { data: profile } = await supabase.from("profiles").select("display_name, username, avatar_url, avatar_preset").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile missing" }, { status: 403, headers: noStore });

  try {
    const { livekitApiKey, livekitApiSecret } = getServerEnv();
    const { livekitUrl } = getPublicEnv();
    const token = await mintVoiceToken({
      apiKey: livekitApiKey,
      apiSecret: livekitApiSecret,
      room,
      identity: { userId: user.id, displayName: profile.display_name, username: profile.username, avatarUrl: profile.avatar_url, avatarPreset: profile.avatar_preset },
    });
    return NextResponse.json({ token, url: livekitUrl, room }, { headers: noStore });
  } catch (err) {
    if (err instanceof MissingEnvError) return NextResponse.json({ error: "Voice is not configured on this server" }, { status: 503, headers: noStore });
    throw err;
  }
}
