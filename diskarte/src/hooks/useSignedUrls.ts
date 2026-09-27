"use client";

import { useEffect, useState } from "react";
import { useSupabase } from "@/components/providers/RuntimeConfig";

const TTL_SECONDS = 60 * 60;
const cache = new Map<string, { url: string; expires: number }>();

export type PrivateBucket = "attachments" | "soundboard";

/** Batched, cached signed URLs for objects in a private bucket (`attachments` by default). */
export function useSignedUrls(paths: string[], bucket: PrivateBucket = "attachments"): Record<string, string> {
  const supabase = useSupabase();
  const key = paths.join("|");
  // Bumped when a batch resolves so the render below re-reads the module cache.
  const [, setVersion] = useState(0);

  useEffect(() => {
    const list = key ? key.split("|") : [];
    const now = Date.now();
    const missing = list.filter((p) => (cache.get(`${bucket}:${p}`)?.expires ?? 0) < now + 60_000);
    if (missing.length === 0) return;
    let cancelled = false;
    void supabase.storage
      .from(bucket)
      .createSignedUrls(missing, TTL_SECONDS)
      .then(({ data }) => {
        for (const item of data ?? []) {
          if (item.signedUrl && item.path) cache.set(`${bucket}:${item.path}`, { url: item.signedUrl, expires: Date.now() + TTL_SECONDS * 1000 });
        }
        if (!cancelled) setVersion((v) => v + 1);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, key, bucket]);

  return fromCache(paths, bucket);
}

function fromCache(paths: string[], bucket: PrivateBucket) {
  const out: Record<string, string> = {};
  for (const p of paths) {
    const hit = cache.get(`${bucket}:${p}`);
    if (hit) out[p] = hit.url;
  }
  return out;
}
