"use client";

import { useEffect } from "react";
import { useOptionalRuntimeConfig } from "@/components/providers/RuntimeConfig";
import { getBrowserClient } from "@/lib/supabase/browser";

/**
 * Counts this browser as a visitor for the Control Center's Traffic tab: a random id kept in
 * localStorage, sent once per tab session (the database keeps one row per browser per day).
 */
export function VisitBeacon() {
  // The client is made in the effect: building it touches `window`, and this renders on the server for every page.
  const config = useOptionalRuntimeConfig();
  useEffect(() => {
    if (!config) return;
    try {
      if (sessionStorage.getItem("diskarte:visited")) return;
      sessionStorage.setItem("diskarte:visited", "1");
      let visitor = localStorage.getItem("diskarte:visitor");
      if (!visitor) {
        visitor = crypto.randomUUID();
        localStorage.setItem("diskarte:visitor", visitor);
      }
      // Fire and forget: a missed count must never bother the visitor.
      const supabase = getBrowserClient(config.supabaseUrl, config.supabaseAnonKey);
      void supabase.rpc("record_site_visit", { p_visitor: visitor }).then(() => undefined, () => undefined);
    } catch {
      // Storage blocked: skip counting.
    }
  }, [config]);
  return null;
}
