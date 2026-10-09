"use client";

import { Menu as MenuIcon, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useShellUI } from "@/components/shell/ShellUI";
import { HomeSidebar } from "@/components/social/HomeSidebar";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import { useIsCanvas, useOptionalWorkspaceStore } from "@/components/workspace/WorkspaceProvider";
import type { Server } from "@/lib/servers";
import { AdminControlCenter } from "./AdminControlCenter";

/**
 * /tambayan/admin. On the floating canvas the Control Center lives in its own panel, so this route
 * opens (docks) it and steps back to Home; on phones it renders the Control Center full-screen.
 */
export function AdminRoute({ servers }: { servers: Server[] }) {
  const isCanvas = useIsCanvas();
  const store = useOptionalWorkspaceStore();
  const router = useRouter();
  const { setNavOpen } = useShellUI();

  useEffect(() => {
    if (!isCanvas || !store) return;
    // Wait for the canvas to be measured so the panel docks against the real right edge.
    let frame = 0;
    const open = () => {
      if (!store.getBounds()) {
        frame = requestAnimationFrame(open);
        return;
      }
      store.openPanel("admin");
      router.replace("/tambayan");
    };
    open();
    return () => cancelAnimationFrame(frame);
  }, [isCanvas, store, router]);

  return (
    <>
      <HomeSidebar servers={servers} />
      <WorkspacePanel id="main" title="Control Center">
        {isCanvas ? (
          <p className="m-auto flex items-center gap-2 text-sm text-slate-400" role="status">
            <ShieldCheck className="size-4 text-sun" aria-hidden /> Opening the Control Center…
          </p>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/5 px-3">
              <button type="button" onClick={() => setNavOpen(true)} aria-label="Open navigation" className="rounded-md p-1.5 text-slate-300 hover:bg-white/10">
                <MenuIcon className="size-5" aria-hidden />
              </button>
              <span className="font-bold text-white">Control Center</span>
            </header>
            <AdminControlCenter />
          </div>
        )}
      </WorkspacePanel>
    </>
  );
}
