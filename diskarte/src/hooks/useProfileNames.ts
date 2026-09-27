"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { useOptionalServer } from "@/components/providers/ServerProvider";

/**
 * Resolves user ids → display names: current members from context, anyone else (people who left,
 * banned users) fetched from profiles once. Returns a stable lookup function.
 */
export function useProfileNames(ids: (string | null | undefined)[]) {
  const supabase = useSupabase();
  const server = useOptionalServer();
  const [extra, setExtra] = useState<Map<string, string>>(() => new Map());

  const known = useMemo(() => new Map((server?.members ?? []).map((m) => [m.user_id, m.nickname ?? m.profile.display_name])), [server?.members]);
  const missingKey = Array.from(new Set(ids.filter((id): id is string => !!id && !known.has(id) && !extra.has(id))))
    .sort()
    .join(",");

  useEffect(() => {
    if (!missingKey) return;
    let cancelled = false;
    void supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", missingKey.split(","))
      .then(({ data }) => {
        if (cancelled) return;
        setExtra((prev) => {
          const next = new Map(prev);
          for (const id of missingKey.split(",")) next.set(id, data?.find((p) => p.id === id)?.display_name ?? "Deleted user");
          return next;
        });
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, missingKey]);

  return useCallback((id: string | null | undefined) => (id ? (known.get(id) ?? extra.get(id) ?? "Someone") : "Someone"), [known, extra]);
}
