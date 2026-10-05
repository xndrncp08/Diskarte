"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface ShellUIValue {
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
  membersOpen: boolean;
  setMembersOpen: (open: boolean) => void;
}

const ShellUIContext = createContext<ShellUIValue | null>(null);

/**
 * Responsive shell toggles: the mobile nav drawer (rail + channels) and the member roster. Inside the
 * app shell the roster's state belongs to the workspace (it's saved with the layout), so the shell
 * passes it in; standalone renders keep it locally.
 */
export function ShellUIProvider({ children, members }: { children: ReactNode; members?: { open: boolean; setOpen: (open: boolean) => void } }) {
  const [navOpen, setNavOpen] = useState(false);
  const [localMembers, setLocalMembers] = useState(false);
  const membersOpen = members?.open ?? localMembers;
  const setMembersOpen = members?.setOpen ?? setLocalMembers;
  const value = useMemo(() => ({ navOpen, setNavOpen, membersOpen, setMembersOpen }), [navOpen, membersOpen, setMembersOpen]);
  return <ShellUIContext.Provider value={value}>{children}</ShellUIContext.Provider>;
}

export function useShellUI(): ShellUIValue {
  const value = useContext(ShellUIContext);
  if (!value) throw new Error("useShellUI must be used inside <ShellUIProvider>");
  return value;
}
