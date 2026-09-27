import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ApprovalEnv } from "@/lib/env";
import type { EmailMessage } from "./template";

export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

export type Mailer = (message: EmailMessage) => Promise<{ id: string }>;

/**
 * Transports:
 * - resend: Resend's REST API (no SDK) — production.
 * - file:   writes one JSON file per message to EMAIL_OUTBOX_DIR (end-to-end tests read these).
 * - log:    prints a redacted summary to the server log (local development).
 */
export function createMailer(config: ApprovalEnv["email"], fetchImpl: typeof fetch = fetch): Mailer {
  if (config.transport === "resend") {
    return async (message) => {
      let res: Response;
      try {
        res = await fetchImpl("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: config.from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
          signal: AbortSignal.timeout(15_000),
        });
      } catch (err) {
        throw new EmailDeliveryError(`Resend unreachable: ${err instanceof Error ? err.message : String(err)}`);
      }
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
      if (!res.ok || !body.id) throw new EmailDeliveryError(`Resend ${res.status}: ${body.message ?? body.name ?? "unknown error"}`.slice(0, 480));
      return { id: body.id };
    };
  }
  if (config.transport === "file") {
    return async (message) => {
      const id = `${Date.now()}-${crypto.randomUUID()}`;
      await mkdir(config.dir, { recursive: true });
      await writeFile(path.join(config.dir, `${id}.json`), JSON.stringify({ id, from: config.from, ...message }, null, 2), { mode: 0o600 });
      return { id };
    };
  }
  return async (message) => {
    const id = `log-${crypto.randomUUID()}`;
    // Never log the body: it contains a live temporary password.
    console.info(`[early-access] email ${id} → ${message.to}: "${message.subject}" (transport=log; set EMAIL_TRANSPORT=resend to deliver)`);
    return { id };
  };
}
