"use client";

import { useEffect } from "react";
import { useMe } from "@/components/providers/MeProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";

/** Clears my custom status when its "clear after" time comes (the minute platform job covers closed tabs). */
export function StatusExpiry() {
  const supabase = useSupabase();
  const { me, setMe } = useMe();
  const expires = me.custom_status_expires_at;
  useEffect(() => {
    if (!expires) return;
    const timer = window.setTimeout(async () => {
      const { error } = await supabase.rpc("clear_expired_custom_statuses");
      if (!error) setMe((p) => (p.custom_status_expires_at === expires ? { ...p, custom_status: null, custom_status_emoji: null, custom_status_expires_at: null } : p));
    }, Math.max(0, new Date(expires).getTime() - Date.now()) + 500);
    return () => window.clearTimeout(timer);
  }, [expires, supabase, setMe]);
  return null;
}
