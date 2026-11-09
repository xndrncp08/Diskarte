"use client";

import { useEffect, useState } from "react";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import type { Database, PresenceStatus } from "@/lib/supabase/database.types";

export type FriendActivity = Database["public"]["Functions"]["friends_activity"]["Returns"][number];

/** A friend's status for badges: anyone not in the feed is offline (invisible is filtered in SQL). */
export function activityStatus(activity: FriendActivity | undefined): PresenceStatus | "offline" {
  return activity?.status ?? "offline";
}

/** Matches the device heartbeat (30 s): a friend shows up within a minute of coming online. */
const POLL_MS = 60_000;

/**
 * Friends who are around right now, from `friends_activity()` (see migration 20261108000000):
 * invisible friends, friends who don't share activity and voice channels the caller can't see are
 * already filtered out in SQL. Polls only while the tab is visible. `null` until the first answer
 * (or forever on a project without the migration — callers just show nothing).
 */
export function useFriendsActivity() {
  const supabase = useSupabase();
  const [activity, setActivity] = useState<Map<string, FriendActivity> | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      clearTimeout(timer);
      if (document.visibilityState === "visible") {
        const { data, error } = await supabase.rpc("friends_activity");
        if (alive && !error) setActivity(new Map((data ?? []).map((row) => [row.user_id, row])));
      }
      if (alive) timer = setTimeout(load, POLL_MS);
    };
    void load();
    const resume = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", resume);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [supabase]);

  return activity;
}
