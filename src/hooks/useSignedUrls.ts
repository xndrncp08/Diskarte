"use client";

import { useEffect, useState } from "react";
import { useSupabase } from "@/components/providers/RuntimeConfig";

const TTL_SECONDS = 60 * 60;
const cache = new Map<string, { url: string; expires: number }>();

/** Batched, cached signed URLs for private `attachments` bucket objects. */
export function useSignedUrls(paths: string[]): Record<string, string> {
  const supabase = useSupabase();
  const key = paths.join("|");
  // Bumped when a batch resolves so the render below re-reads the module cache.
  const [, setVersion] = useState(0);

  useEffect(() => {
    const list = key ? key.split("|") : [];
    const now = Date.now();
    const missing = list.filter((p) => (cache.get(p)?.expires ?? 0) < now + 60_000);
    if (missing.length === 0) return;
    let cancelled = false;
    void supabase.storage
      .from("attachments")
      .createSignedUrls(missing, TTL_SECONDS)
      .then(({ data }) => {
        for (const item of data ?? []) {
          if (item.signedUrl && item.path) cache.set(item.path, { url: item.signedUrl, expires: Date.now() + TTL_SECONDS * 1000 });
        }
        if (!cancelled) setVersion((v) => v + 1);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, key]);

  return fromCache(paths);
}

function fromCache(paths: string[]) {
  const out: Record<string, string> = {};
  for (const p of paths) {
    const hit = cache.get(p);
    if (hit) out[p] = hit.url;
  }
  return out;
}
