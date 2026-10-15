import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { needsSecondFactor, isVerified } from "@/lib/auth";
import { createRateLimiter } from "@/lib/rate-limit";
import { getVoicePreview } from "@/lib/voice-preview-server";
const limit = createRateLimiter({ limit: 45, windowMs: 60_000 });
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return Response.json({ error: "Sign in to see voice activity." }, { status: 401, headers });
  if (await needsSecondFactor()) return Response.json({ error: "Complete two-factor sign-in." }, { status: 403, headers });
  if (!limit.check(user.id).ok) return Response.json({ error: "Please wait before refreshing voice activity." }, { status: 429, headers });
  const serverId = new URL(request.url).searchParams.get("serverId");
  if (!z.uuid().safeParse(serverId).success) return Response.json({ error: "Invalid server." }, { status: 400, headers });
  const [membership, banned] = await Promise.all([db.from("members").select("user_id").eq("server_id", serverId!).eq("user_id", user.id).maybeSingle(), db.rpc("is_platform_banned", {})]);
  if (membership.error || banned.error) return Response.json({ error: "Couldn’t verify access." }, { status: 503, headers });
  if (!membership.data || banned.data) return Response.json({ error: "This server is no longer available to you." }, { status: 403, headers });
  try { return Response.json(await getVoicePreview(db, serverId!, isVerified(user)), { headers }); }
  catch { return Response.json({ error: "Live voice activity is unavailable. Try again." }, { status: 503, headers }); }
}
