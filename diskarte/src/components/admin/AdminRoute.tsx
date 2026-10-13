"use client";

import { Menu as MenuIcon } from "lucide-react";
import { useShellUI } from "@/components/shell/ShellUI";
import { HomeSidebar } from "@/components/social/HomeSidebar";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import type { Server } from "@/lib/servers";
import { AdminControlCenter } from "./AdminControlCenter";

/** /tambayan/admin: the Control Center as a page, next to the Home sidebar. */
export function AdminRoute({ servers }: { servers: Server[] }) {
  const { setNavOpen } = useShellUI();
  return (
    <>
      <HomeSidebar servers={servers} />
      <WorkspacePanel id="main" title="Control Center">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/5 px-3">
            <button type="button" onClick={() => setNavOpen(true)} aria-label="Open navigation" className="touch-target relative rounded-md p-1.5 text-slate-300 hover:bg-white/10 md:hidden">
              <MenuIcon className="size-5" aria-hidden />
            </button>
            <span className="font-bold text-white">Control Center</span>
          </header>
          <AdminControlCenter />
        </div>
      </WorkspacePanel>
    </>
  );
}
