import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@/lib/env";

// Domain-separated from the LiveKit secret, so no extra env var is needed; null when it isn't set.
function key(): Buffer | null {
  try {
    return createHmac("sha256", getServerEnv().livekitApiSecret).update("diskarte:unfurl-image:v1").digest();
  } catch {
    return null;
  }
}

const sign = (k: Buffer, url: string) => createHmac("sha256", k).update(url).digest("base64url");

/** `/api/unfurl/image?u=…&s=…` for an image a preview found, or null when signing isn't available. */
export function signedImageUrl(url: string): string | null {
  const k = key();
  return k ? `/api/unfurl/image?${new URLSearchParams({ u: url, s: sign(k, url) })}` : null;
}

export function verifyImageUrl(url: string, signature: string): boolean {
  const k = key();
  if (!k) return false;
  const expected = Buffer.from(sign(k, url));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
