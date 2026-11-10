import { WebhookReceiver } from "livekit-server-sdk";
import { getServerEnv } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/service";
/**
 * POST /api/livekit/webhook — LiveKit's signed room events. Verifies the JWT and body digest with the
 * LiveKit key/secret, then broadcasts an empty `voice_changed` on the server's private `server:<id>`
 * topic so open voice previews refetch (a private channel's own `voice:<id>` topic instead, so nobody
 * else learns when people come and go). Never forwards participant data. 503 lets LiveKit retry.
 */
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length")) > 65536) return new Response(null, { status: 413 });
  const raw = await request.text();
  if (raw.length > 65536) return new Response(null, { status: 413 });
  let event;
  try { const env = getServerEnv(); event = await new WebhookReceiver(env.livekitApiKey, env.livekitApiSecret).receive(raw, request.headers.get("authorization") ?? ""); }
  catch { return new Response(null, { status: 401 }); }
  if (!["participant_joined", "participant_left", "participant_connection_aborted", "track_published", "track_unpublished", "room_finished"].includes(event.event) || !/^voice:[0-9a-f-]{36}$/.test(event.room?.name ?? "")) return new Response(null, { status: 204 });
  try {
    const db = createServiceClient();
    const result = await db.from("channels").select("server_id,is_private").eq("id", event.room!.name.slice(6)).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return new Response(null, { status: 204 });
    const channel = db.channel(result.data.is_private ? event.room!.name : `server:${result.data.server_id}`, { config: { private: true } });
    try {
      const sent = await channel.send({ type: "broadcast", event: "voice_changed", payload: {} });
      if (sent !== "ok") throw new Error("BROADCAST_FAILED");
    } finally { await db.removeChannel(channel); }
    return new Response(null, { status: 204 });
  } catch { return new Response(null, { status: 503 }); }
}
