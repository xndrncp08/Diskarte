import { buildHealthReport } from "@/lib/health";

/** GET /api/health          → liveness (always 200 while the process is serving)
 *  GET /api/health?deep=1   → readiness, also pings Supabase; 503 when degraded */
export async function GET(request: Request) {
  const deep = new URL(request.url).searchParams.has("deep");
  const report = await buildHealthReport({ deep });
  const status = deep && report.status !== "ok" ? 503 : 200;
  return Response.json(report, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function HEAD() {
  return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}
