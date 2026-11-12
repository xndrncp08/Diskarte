"use client";

import { createContext, useContext } from "react";
import type { Shell } from "@/lib/shell";

/**
 * Which frame the tambayan layout rendered (from the `diskarte-shell` cookie). The shared seams
 * (WorkspacePanel, RosterDrawer, ChannelHeader, PageHeader) read it to render their Pulse path; outside the
 * app shell (tests, isolated renders) it is Classic.
 */
export const ShellKindContext = createContext<Shell>("classic");

export function useShellKind(): Shell {
  return useContext(ShellKindContext);
}
