"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Tables } from "@/lib/supabase/database.types";

type Profile = Tables<"profiles">;

interface MeContextValue {
  me: Profile;
  setMe: (updater: (prev: Profile) => Profile) => void;
  /** Confirmed email or phone — required to chat in verification-gated channels. */
  verified: boolean;
}

const MeContext = createContext<MeContextValue | null>(null);

export function MeProvider({ profile, verified = true, children }: { profile: Profile; verified?: boolean; children: ReactNode }) {
  const [me, setMeState] = useState(profile);
  const [seed, setSeed] = useState(profile);
  // Server re-renders (router.refresh / revalidatePath) hand us a fresh profile: adopt it.
  if (seed !== profile) {
    setSeed(profile);
    setMeState(profile);
  }
  return <MeContext.Provider value={{ me, setMe: setMeState, verified }}>{children}</MeContext.Provider>;
}

export function useMe(): MeContextValue {
  const value = useContext(MeContext);
  if (!value) throw new Error("useMe must be used inside <MeProvider>");
  return value;
}
