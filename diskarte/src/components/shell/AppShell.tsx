"use client";

import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useShellEntrance } from "@/components/motion/useShellEntrance";
import { useSwipeDrawer } from "@/hooks/useSwipeDrawer";
import { useMe } from "@/components/providers/MeProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { subscribeDbChanges } from "@/lib/realtime";
import type { Server } from "@/lib/servers";
import { cn } from "@/lib/utils";
import { DiskarteCanvasBackground } from "@/components/workspace/DiskarteCanvasBackground";
import { WorkspaceCanvas } from "@/components/workspace/WorkspaceCanvas";
import { useWorkspace, useWorkspaceStore, WorkspaceProvider } from "@/components/workspace/WorkspaceProvider";
import { ServerRail } from "./ServerRail";
import { ShellUIProvider, useShellUI } from "./ShellUI";

/** Refreshes the server list when this user joins/leaves/is kicked from any Tambayan (e.g. in another tab). */
function MembershipWatcher({ userId }: { userId: string }) {
  const supabase = useSupabase();
  const router = useRouter();
  useEffect(() => {
    return subscribeDbChanges(supabase, `memberships:${userId}`, (channel) =>
      channel
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "members", filter: `user_id=eq.${userId}` }, () => router.refresh())
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "members" }, ({ old }) => {
          if ((old as { user_id?: string }).user_id === userId) router.refresh();
        }),
    );
  }, [supabase, userId, router]);
  return null;
}

function Frame({ servers, children }: { servers: Server[]; children: ReactNode }) {
  const { navOpen, setNavOpen } = useShellUI();
  const swipe = useSwipeDrawer(navOpen, setNavOpen);
  const frame = useRef<HTMLDivElement>(null);
  useShellEntrance(frame);
  return (
    <div ref={frame} className="diskarte-backdrop relative flex h-dvh overflow-hidden md:gap-3 md:p-3" data-testid="shell" {...swipe}>
      <DiskarteCanvasBackground />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-sun focus:px-4 focus:py-2 focus:font-semibold focus:text-abyss"
      >
        Skip to content
      </a>
      <AnimatePresence>
        {navOpen && (
          <motion.button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden"
            onClick={() => setNavOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, pointerEvents: "none" }}
            transition={{ duration: 0.2 }}
          />
        )}
      </AnimatePresence>
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-40 transition-transform duration-200 ease-out md:relative md:z-10 md:flex md:translate-x-0",
          navOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <ServerRail servers={servers} />
      </div>
      {/* The floating canvas. On phones it is a plain flex row with no z-index: a stacking context
          would trap the drawer panels (z-40) beneath the drawer backdrop (z-30). */}
      <WorkspaceCanvas>{children}</WorkspaceCanvas>
    </div>
  );
}

/** Bridges the shell's member toggle to the workspace roster (open/docked/closed, saved with the layout). */
export function ShellUIBridge({ children }: { children: ReactNode }) {
  const store = useWorkspaceStore();
  const roster = useWorkspace((s) => s.roster);
  const setOpen = useCallback((open: boolean) => store.setRoster(open ? "open" : "closed"), [store]);
  const members = useMemo(() => ({ open: roster !== "closed", setOpen }), [roster, setOpen]);
  return <ShellUIProvider members={members}>{children}</ShellUIProvider>;
}

/**
 * The signed-in app frame: the command rail and the floating workspace canvas. Session state (the
 * call, presence, friends) lives above it in <SessionProviders>; the layout itself in <WorkspaceProvider>.
 */
export function AppShell({ servers, workspace, children }: { servers: Server[]; workspace?: unknown; children: ReactNode }) {
  const { me } = useMe();
  return (
    <WorkspaceProvider remote={workspace}>
      <ShellUIBridge>
        <MembershipWatcher userId={me.id} />
        <Frame servers={servers}>{children}</Frame>
      </ShellUIBridge>
    </WorkspaceProvider>
  );
}

/** Wraps a secondary sidebar so it joins the rail in the mobile drawer (standalone layouts; the app uses WorkspacePanel). */
export function DrawerPanel({ children }: { children: ReactNode }) {
  const { navOpen } = useShellUI();
  return (
    <div
      className={cn(
        "fixed inset-y-0 left-[72px] z-40 transition-transform duration-200 ease-out md:static md:z-auto md:translate-x-0",
        navOpen ? "translate-x-0" : "-translate-x-[calc(100%+72px)]",
      )}
    >
      {children}
    </div>
  );
}
