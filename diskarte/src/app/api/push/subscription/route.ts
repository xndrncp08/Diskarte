import { ECDH } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { needsSecondFactor } from "@/lib/auth";
import { validPushEndpoint } from "@/lib/push-policy";
import { pushConfig } from "@/lib/push-server";
const headers = { "Cache-Control": "private, no-store" };
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("register"), device: z.uuid(), label: z.string().min(1).max(80), subscription: z.object({ endpoint: z.string().max(2048).refine(validPushEndpoint), keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/), auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/) }) }) }),
  z.object({ action: z.literal("remove"), device: z.uuid() }),
  z.object({ action: z.literal("test"), device: z.uuid() }),
]);
export async function GET() {
  const db = await createClient(); const { data: { user } } = await db.auth.getUser();
  if (!user) return Response.json({ error: "Sign in to manage notifications." }, { status: 401, headers });
  if (await needsSecondFactor()) return Response.json({ error: "Complete two-factor sign-in." }, { status: 403, headers });
  const [ready, devices] = await Promise.all([db.rpc("push_ready", {}), db.rpc("list_push_devices", {})]);
  if (ready.error || devices.error) return Response.json({ error: "Push database setup is incomplete." }, { status: 503, headers });
  return Response.json({ configured: !!pushConfig() && ready.data === true, publicKey: pushConfig()?.publicKey ?? null, devices: devices.data }, { headers });
}
export async function POST(request: Request) {
  const db = await createClient(); const { data: { user } } = await db.auth.getUser();
  if (!user) return Response.json({ error: "Sign in to manage notifications." }, { status: 401, headers });
  if (Number(request.headers.get("content-length")) > 8192) return new Response(null, { status: 413, headers });
  const raw = await request.text(); if (raw.length > 8192) return new Response(null, { status: 413, headers });
  let input; try { input = schema.safeParse(JSON.parse(raw)); } catch { return Response.json({ error: "Invalid push request." }, { status: 400, headers }); }
  if (!input.success) return Response.json({ error: "Invalid push subscription." }, { status: 400, headers });
  const value = input.data;
  if (value.action !== "remove" && await needsSecondFactor()) return Response.json({ error: "Complete two-factor sign-in." }, { status: 403, headers });
  if (value.action !== "remove" && !pushConfig()) return Response.json({ error: "Server push is not configured." }, { status: 503, headers });
  let result;
  if (value.action === "register") {
    try { ECDH.convertKey(Buffer.from(value.subscription.keys.p256dh, "base64url"), "prime256v1"); }
    catch { return Response.json({ error: "Invalid subscription encryption key." }, { status: 400, headers }); }
    result = await db.rpc("register_push", { p_device: value.device, p_label: value.label, p_endpoint: value.subscription.endpoint, p_p256dh: value.subscription.keys.p256dh, p_auth: value.subscription.keys.auth });
  } else if (value.action === "test") result = await db.rpc("request_push_test", { p_device: value.device });
  else result = await db.rpc("remove_push_device", { p_device: value.device });
  if (result.error) {
    const limited = result.error.message.includes("PUSH_RATE_LIMIT");
    return Response.json({ error: limited ? "Wait one minute before trying again." : "Push settings couldn’t be saved. Check account access and database setup." }, { status: limited ? 429 : 400, headers });
  }
  return Response.json({ ok: true }, { headers });
}
