import { authorizedPushJob, dispatchPush, pushConfig } from "@/lib/push-server";
export async function POST(request: Request) {
  const secret = process.env.PUSH_DISPATCH_SECRET;
  if (!secret || secret.length < 32) return new Response(null, { status: 503 });
  if (!authorizedPushJob(request.headers.get("authorization"), secret)) return new Response(null, { status: 401 });
  if (!pushConfig()) return new Response(null, { status: 503 });
  // Request bodies cannot specify recipients or payloads; claims come exclusively from the database.
  try { const result = await dispatchPush(); console.info(JSON.stringify({ event: "push_batch", ...result })); return Response.json(result, { headers: { "Cache-Control": "no-store" } }); }
  catch { console.error(JSON.stringify({ event: "push_dispatch_failed", code: "queue_unavailable" })); return new Response(null, { status: 503 }); }
}
