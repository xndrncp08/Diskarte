import "server-only";
import { createHash, timingSafeEqual, ECDH, createECDH } from "node:crypto";
import webpush from "web-push";
import { z } from "zod";
import { createServiceClient } from "./supabase/service";
import { allowPush, safePushPath, validPushEndpoint } from "./push-policy";
import { parseNotifyPrefs, PUSH_KINDS } from "./notify-prefs";
export function pushConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? "", privateKey = process.env.VAPID_PRIVATE_KEY ?? "", subject = process.env.VAPID_SUBJECT ?? "", secret = process.env.PUSH_DISPATCH_SECRET ?? "";
  if (!/^[A-Za-z0-9_-]{87}$/.test(publicKey) || !/^[A-Za-z0-9_-]{43}$/.test(privateKey) || !/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(subject) || secret.length < 32 || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try { const key = ECDH.convertKey(Buffer.from(publicKey, "base64url"), "prime256v1"); const pair = createECDH("prime256v1"); pair.setPrivateKey(Buffer.from(privateKey,"base64url")); if (typeof key === "string" || key.length !== 65 || !key.equals(pair.getPublicKey())) return null; }
  catch { return null; }
  return { publicKey, privateKey, subject, secret };
}
export function authorizedPushJob(header: string | null, secret: string) {
  const given = Buffer.from(header ?? ""), expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
const jobSchema = z.object({
  id: z.uuid(), userId: z.uuid(), kind: z.enum([...PUSH_KINDS, "test"]), serverId: z.uuid().nullable(), channelId: z.uuid().nullable(), prefs: z.unknown(),
  title: z.string().max(500), body: z.string().max(180), href: z.string().max(300), tag: z.string().max(100), timestamp: z.number(), expiresAt: z.string(), badge: z.number().int().nonnegative().optional(), attempt: z.number().int().optional(),
  subscription: z.object({ endpoint: z.string().max(2048).refine(validPushEndpoint), keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/), auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/) }) }),
});
export type PushJob = z.infer<typeof jobSchema>;
export function pushPayload(job: PushJob) {
  const prefs = parseNotifyPrefs(JSON.stringify(job.prefs));
  const previews = prefs.push?.previews === true || job.kind === "test";
  return { version: 1, id: job.id, userId: job.userId, title: previews ? job.title.slice(0, 100) : "Diskarte", body: previews ? job.body : "You have new activity. Open Diskarte to view it.", href: safePushPath(job.href), tag: job.tag, timestamp: job.timestamp, badge: job.badge ?? 1, silent: prefs.push?.sound === false };
}
/** Classified status codes only: provider response bodies and endpoints must never enter logs. */
export function pushFailure(error: unknown, attempt = 1, now = Date.now()) {
  const failure = error as { statusCode?: unknown; headers?: Record<string, unknown> };
  const status = typeof failure?.statusCode === "number" ? failure.statusCode : null;
  if (status === 404 || status === 410) return { result: "expired", status, code: "subscription_expired", delay: 1 };
  if (status !== null && status >= 400 && status < 500 && status !== 408 && status !== 429) return { result: "failed", status, code: "provider_rejected", delay: 1 };
  const retryAfter = failure?.headers?.["retry-after"];
  const requested = typeof retryAfter === "string" ? (/^\d+$/.test(retryAfter) ? Number(retryAfter) : (Date.parse(retryAfter) - now) / 1000) : 0;
  return { result: "retry", status, code: status === 429 ? "provider_rate_limit" : "provider_unavailable", delay: Math.min(3600, Math.max(15 * 2 ** Math.min(attempt - 1, 8) + Math.floor(Math.random() * 10), Number.isFinite(requested) ? requested : 0)) };
}
export async function dispatchPush(db = createServiceClient(), send = webpush.sendNotification) {
  const config = pushConfig();
  if (!config) throw new Error("PUSH_UNCONFIGURED");
  const claims = await db.rpc("claim_push_jobs", { p_limit: 20 });
  if (claims.error) throw new Error("PUSH_CLAIM_FAILED");
  const summary = { claimed: claims.data?.length ?? 0, sent: 0, skipped: 0, failed: 0 };
  for (let offset = 0; offset < summary.claimed; offset += 4) {
    const results = await Promise.allSettled(claims.data!.slice(offset, offset + 4).map(async (claim) => {
      const finish = async (result: string, status: number | null, code: string, delay = 60) => {
        const saved = await db.rpc("finish_push_job", { p_id: claim.id, p_lease: claim.lease, p_result: result, p_status: status, p_code: code, p_delay: Math.ceil(delay) });
        if (saved.error) throw new Error("PUSH_ACK_FAILED");
      };
      const prepared = await db.rpc("prepare_push_job", { p_id: claim.id, p_lease: claim.lease });
      if (prepared.error) throw new Error("PUSH_PREPARE_FAILED");
      if (prepared.data === null) { await finish("skipped", null, "access_changed"); summary.skipped++; return; }
      const parsed = jobSchema.safeParse(prepared.data);
      if (!parsed.success) { await finish("failed", null, "invalid_payload"); summary.failed++; return; }
      const job = parsed.data;
      if (!allowPush(job.prefs, job.kind, job.serverId, job.channelId)) { await finish("skipped", null, "preferences"); summary.skipped++; return; }
      try {
        const ttl = Math.max(0, Math.min(3600, Math.floor((Date.parse(job.expiresAt) - Date.now()) / 1000)));
        if (!ttl) { await finish("skipped", null, "expired"); summary.skipped++; return; }
        const result = await send(job.subscription, JSON.stringify(pushPayload(job)), { vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey }, TTL: ttl, urgency: job.kind === "call" ? "high" : "normal", topic: createHash("sha256").update(job.tag).digest("base64url").slice(0, 32), timeout: 5000, contentEncoding: "aes128gcm" });
        await finish("sent", result.statusCode, "ok"); summary.sent++;
      } catch (error) {
        // An acknowledgement failure leaves the lease for recovery; it isn't a provider failure.
        if (error instanceof Error && error.message === "PUSH_ACK_FAILED") throw error;
        const failure = pushFailure(error, job.attempt);
        await finish(failure.result, failure.status, failure.code, failure.delay); summary.failed++;
      }
    }));
    if (results.some((result) => result.status === "rejected")) throw new Error("PUSH_BATCH_FAILED");
  }
  if (summary.claimed === 20) {
    const wake = await db.rpc("wake_push", {});
    if (wake.error) throw new Error("PUSH_WAKE_FAILED");
  }
  return summary;
}
