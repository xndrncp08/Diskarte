"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { getBrowserClient, type BrowserSupabase } from "@/lib/supabase/browser";

export interface RuntimeConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  livekitUrl: string;
  siteUrl: string;
}

const RuntimeConfigContext = createContext<RuntimeConfig | null>(null);

export function RuntimeConfigProvider({ value, children }: { value: RuntimeConfig | null; children: ReactNode }) {
  return <RuntimeConfigContext.Provider value={value}>{children}</RuntimeConfigContext.Provider>;
}

export function useRuntimeConfig(): RuntimeConfig {
  const value = useContext(RuntimeConfigContext);
  if (!value) {
    throw new Error("Diskarte runtime config is missing — check SUPABASE_URL / SUPABASE_ANON_KEY / LIVEKIT_URL.");
  }
  return value;
}

export function useOptionalRuntimeConfig(): RuntimeConfig | null {
  return useContext(RuntimeConfigContext);
}

/** Like useSupabase, but null when there's no runtime config (isolated component tests). */
export function useOptionalSupabase(): BrowserSupabase | null {
  const config = useOptionalRuntimeConfig();
  return useMemo(() => (config ? getBrowserClient(config.supabaseUrl, config.supabaseAnonKey) : null), [config]);
}

/** Browser Supabase client bound to the runtime config (singleton). */
export function useSupabase(): BrowserSupabase {
  const { supabaseUrl, supabaseAnonKey } = useRuntimeConfig();
  return useMemo(() => getBrowserClient(supabaseUrl, supabaseAnonKey), [supabaseUrl, supabaseAnonKey]);
}
