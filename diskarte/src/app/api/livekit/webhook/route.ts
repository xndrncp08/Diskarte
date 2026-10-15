import { WebhookReceiver } from "livekit-server-sdk";
import { getServerEnv } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/service";
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
    const result = await db.from("channels").select("server_id").eq("id", event.room!.name.slice(6)).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return new Response(null, { status: 204 });
    const channel = db.channel(`server:${result.data.server_id}`, { config: { private: true } });
    try {
      const sent = await channel.send({ type: "broadcast", event: "voice_changed", payload: {} });
      if (sent !== "ok") throw new Error("BROADCAST_FAILED");
    } finally { await db.removeChannel(channel); }
    return new Response(null, { status: 204 });
  } catch { return new Response(null, { status: 503 }); }
}
