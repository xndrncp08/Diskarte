"use client";

import { useEffect } from "react";
import { useOptionalSupabase } from "@/components/providers/RuntimeConfig";

/**
 * Counts this browser as a visitor for the Control Center's Traffic tab: a random id kept in
 * localStorage, sent once per tab session (the database keeps one row per browser per day).
 */
export function VisitBeacon() {
  const supabase = useOptionalSupabase();
  useEffect(() => {
    if (!supabase) return;
    try {
      if (sessionStorage.getItem("diskarte:visited")) return;
      sessionStorage.setItem("diskarte:visited", "1");
      let visitor = localStorage.getItem("diskarte:visitor");
      if (!visitor) {
        visitor = crypto.randomUUID();
        localStorage.setItem("diskarte:visitor", visitor);
      }
      // Fire and forget: a missed count must never bother the visitor.
      void supabase.rpc("record_site_visit", { p_visitor: visitor }).then(() => undefined, () => undefined);
    } catch {
      // Storage blocked: skip counting.
    }
  }, [supabase]);
  return null;
}
