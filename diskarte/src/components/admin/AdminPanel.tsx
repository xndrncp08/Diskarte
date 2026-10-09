"use client";

import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { AdminControlCenter } from "./AdminControlCenter";

/**
 * The Control Center as a glass panel on the floating canvas: drag, snap and resize it like any
 * other panel — docked beside chat or the roster, the shared edge resizes both (coupled resizing).
 * Its content only mounts (and fetches) while the panel is open.
 */
export function AdminPanel() {
  const open = useWorkspace((s) => !s.panels.admin.closed);
  return (
    <WorkspacePanel id="admin" title="Control Center" closable>
      {open && <AdminControlCenter />}
    </WorkspacePanel>
  );
}
