"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface ShellUIValue {
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
  membersOpen: boolean;
  setMembersOpen: (open: boolean) => void;
}

const ShellUIContext = createContext<ShellUIValue | null>(null);

/** Responsive shell toggles: the mobile nav drawer (rail + channels) and the member list. */
export function ShellUIProvider({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(true);
  const value = useMemo(() => ({ navOpen, setNavOpen, membersOpen, setMembersOpen }), [navOpen, membersOpen]);
  return <ShellUIContext.Provider value={value}>{children}</ShellUIContext.Provider>;
}

export function useShellUI(): ShellUIValue {
  const value = useContext(ShellUIContext);
  if (!value) throw new Error("useShellUI must be used inside <ShellUIProvider>");
  return value;
}
