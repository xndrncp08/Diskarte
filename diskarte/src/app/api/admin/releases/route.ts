import { z } from "zod";
import { isSuperAdmin } from "@/lib/admin-server";
import { RELEASES } from "@/lib/releases";
import { announceRelease } from "@/lib/releases-server";
import { createClient } from "@/lib/supabase/server";

const headers = { "Cache-Control": "no-store" };
const schema = z.object({ action: z.enum(["publish", "withdraw", "reset"]), id: z.string().max(80) });

/**
 * POST /api/admin/releases { action, id } — super admins retry publishing a release's announcement,
 * withdraw its post, or reset it (removes the post and record so corrected notes publish again).
 * Publishing uses the service role, exactly like the automatic post at deployment start.
 */
export async function POST(request: Request) {
  if (!(await isSuperAdmin())) return Response.json({ error: "Forbidden" }, { status: 403, headers });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  const release = parsed.success ? RELEASES.find((r) => r.id === parsed.data.id) : undefined;
  if (!parsed.success || !release) return Response.json({ error: "Unknown release" }, { status: 400, headers });
  const db = await createClient();
  if (parsed.data.action === "withdraw" || parsed.data.action === "reset") {
    const { error } = await db.rpc(parsed.data.action === "withdraw" ? "admin_withdraw_release_announcement" : "admin_reset_release_announcement", { p_release_id: release.id });
    if (error) return Response.json({ error: "Couldn't change the announcement. Is the latest migration applied?" }, { status: 503, headers });
    if (parsed.data.action === "withdraw") return Response.json({ result: "withdrawn" }, { headers });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return Response.json({ error: "Publishing needs SUPABASE_SERVICE_ROLE_KEY on the server." }, { status: 503, headers });
  const result = await announceRelease(release);
  return Response.json({ result }, { status: result === "failed" ? 503 : 200, headers });
}
