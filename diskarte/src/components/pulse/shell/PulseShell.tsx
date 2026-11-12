"use client";

import type { ReactNode } from "react";
import { AppFrame } from "@/components/shell/AppFrame";
import type { RailEntry } from "@/components/shell/ServerRail";

/** Standalone Pulse frame; the application mounts AppFrame directly to preserve conversation state. */
export function PulseShell(props: { servers: RailEntry[]; children: ReactNode }) {
  return <AppFrame {...props} shell="pulse" />;
}
