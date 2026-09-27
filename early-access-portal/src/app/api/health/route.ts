import { NextResponse } from "next/server";
import { tryGetPortalEnv } from "@/lib/env";

/** Liveness for Docker / Render. Reports whether configuration is present, never its values. */
export function GET() {
  const env = tryGetPortalEnv();
  return NextResponse.json(
    { status: "ok", service: "diskarte-early-access", configured: Boolean(env), time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
