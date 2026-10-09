"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PlatformRole } from "@/lib/admin";

const AdminAccessContext = createContext<PlatformRole>("member");

/**
 * The signed-in user's platform role as verified by the server for this render. It only decides
 * what to *show* (the Control Center button and panel); every admin request is re-checked server-side.
 */
export function AdminAccessProvider({ role, children }: { role: PlatformRole; children: ReactNode }) {
  return <AdminAccessContext.Provider value={role}>{children}</AdminAccessContext.Provider>;
}

export function usePlatformRole(): PlatformRole {
  return useContext(AdminAccessContext);
}
