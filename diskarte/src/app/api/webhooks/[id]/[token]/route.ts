import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Incoming channel webhook: POST {"content": "…", "username"?: "…"} (Discord-style "content" so
 * existing scripts work). Runs without a session; the token is checked in the database.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; token: string }> }) {
  const { id, token } = await params;
  if (!UUID.test(id) || !/^[0-9a-f]{48}$/.test(token)) return json({ error: "Unknown webhook" }, 404);
  if (Number(request.headers.get("content-length")) > 16_384) return json({ error: "Too large" }, 413);
  const raw = await request.text();
  if (raw.length > 16_384) return json({ error: "Too large" }, 413);
  let body: { content?: unknown; username?: unknown };
  try { body = JSON.parse(raw); } catch { return json({ error: "Send JSON: {\"content\": \"…\"}" }, 400); }
  if (typeof body?.content !== "string" || !body.content.trim() || body.content.length > 2000) return json({ error: "content must be 1–2000 characters" }, 400);
  if (body.username !== undefined && typeof body.username !== "string") return json({ error: "username must be text" }, 400);

  const env = getPublicEnv();
  const db = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await db.rpc("post_webhook_message", { p_id: id, p_token: token, p_content: body.content, p_name: body.username ?? null });
  if (!error) return json({ id: data }, 200);
  if (error.message.includes("WEBHOOK_NOT_FOUND")) return json({ error: "Unknown webhook" }, 404);
  if (error.message.includes("WEBHOOK_RATE_LIMITED")) return new Response(JSON.stringify({ error: "Slow down: 30 messages a minute" }), { status: 429, headers: { "Retry-After": "60", "Content-Type": "application/json" } });
  if (error.message.includes("INVALID_CONTENT")) return json({ error: "content must be 1–2000 characters" }, 400);
  return json({ error: "Couldn't post" }, 503);
}
