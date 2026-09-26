"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type BrowserSupabase = SupabaseClient<Database>;

let client: BrowserSupabase | null = null;

/** Singleton browser client; url/key come from the runtime config the root layout injects. */
export function getBrowserClient(url: string, anonKey: string): BrowserSupabase {
  if (!client) {
    client = createBrowserClient<Database>(url, anonKey);
  }
  return client;
}
