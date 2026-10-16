"use client";

import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useAppViewport } from "@/hooks/useAppViewport";
import { MobileNavigation } from "./MobileNavigation";
import { useSwipeDrawer } from "@/hooks/useSwipeDrawer";
import { useMe } from "@/components/providers/MeProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { subscribeDbChanges } from "@/lib/realtime";
import type { Server } from "@/lib/servers";
import { ConfirmHost } from "@/components/ui/ConfirmHost";
import { AdminAccessProvider } from "@/components/admin/AdminAccess";
import { BroadcastBanner } from "@/components/broadcast/BroadcastBanner";
import type { PlatformRole } from "@/lib/admin";
import { cn } from "@/lib/utils";
import { useIsCanvas, useLayout, WorkspaceProvider } from "@/components/workspace/WorkspaceProvider";
import { UnreadsProvider } from "@/components/providers/UnreadsProvider";
import { AppBadge, DmNotifier } from "./DmNotifier";
import { PushBadge } from "@/components/notifications/PushBadge";
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
  const desktop = useIsCanvas();
  const frame = useRef<HTMLDivElement>(null);
  useAppViewport(frame);
  useEffect(() => {
    if (!navOpen || desktop) return;
    const previous = document.activeElement as HTMLElement | null;
    const controls = () => Array.from(frame.current?.querySelectorAll<HTMLElement>("[data-mobile-navigation] a[href], [data-mobile-navigation] button:not([disabled]), [data-mobile-navigation] input") ?? []).filter((el) => el.getClientRects().length > 0);
    controls()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setNavOpen(false); }
      if (event.key !== "Tab" || document.querySelector('[role="dialog"]')) return;
      const nodes = controls();
      const index = nodes.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && (index === nodes.length - 1 || index < 0)) { event.preventDefault(); nodes[0]?.focus(); }
    };
    const back = () => setNavOpen(false);
    window.addEventListener("keydown", key);
    window.addEventListener("popstate", back);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("popstate", back); previous?.focus({ preventScroll: true }); };
  }, [navOpen, desktop, setNavOpen]);
  return (
    <div ref={frame} className="diskarte-backdrop app-viewport relative flex h-dvh overflow-hidden" data-testid="shell" {...swipe}>
      <PushBadge />
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
        data-mobile-navigation=""
        inert={!desktop && !navOpen}
        className={cn(
          "fixed inset-y-0 left-0 z-40 transition-transform duration-200 ease-out md:relative md:z-10 md:flex md:translate-x-0",
          navOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <ServerRail servers={servers} />
      </div>
      {/* The sticky broadcast banner sits above the columns. The column row has no z-index: a stacking
          context would trap the phone drawer panels (z-40) beneath the drawer backdrop (z-30). */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <BroadcastBanner />
        <div className="relative flex min-h-0 min-w-0 flex-1" data-workspace="">
          {children}
        </div>
        <MobileNavigation />
      </div>
    </div>
  );
}

/** Bridges the shell's member toggle to the saved layout. */
export function ShellUIBridge({ children }: { children: ReactNode }) {
  const [layout, setLayout] = useLayout();
  const setOpen = useCallback((membersOpen: boolean) => setLayout({ membersOpen }), [setLayout]);
  const members = useMemo(() => ({ open: layout.membersOpen, setOpen }), [layout.membersOpen, setOpen]);
  return <ShellUIProvider members={members}>{children}</ShellUIProvider>;
}

/**
 * The signed-in app frame: the server rail and the columns (channels · main · members). Session state
 * (the call, presence, friends) lives above it in <SessionProviders>; column widths in <WorkspaceProvider>.
 */
export function AppShell({ servers, platformRole = "member", children }: { servers: Server[]; platformRole?: PlatformRole; children: ReactNode }) {
  const { me } = useMe();
  return (
    <AdminAccessProvider role={platformRole}>
      <WorkspaceProvider>
        <UnreadsProvider>
          <ShellUIBridge>
            <MembershipWatcher userId={me.id} />
            <DmNotifier />
            <AppBadge />
            <Frame servers={servers}>{children}</Frame>
            <ConfirmHost />
          </ShellUIBridge>
        </UnreadsProvider>
      </WorkspaceProvider>
    </AdminAccessProvider>
  );
}

/** Wraps a secondary sidebar so it joins the rail in the mobile drawer (standalone layouts; the app uses WorkspacePanel). */
export function DrawerPanel({ children }: { children: ReactNode }) {
  const { navOpen } = useShellUI();
  return (
    <div
      data-mobile-navigation=""
      className={cn(
        "fixed inset-y-0 left-[72px] z-40 transition-transform duration-200 ease-out md:static md:z-auto md:translate-x-0",
        navOpen ? "translate-x-0" : "-translate-x-[calc(100%+72px)]",
      )}
    >
      {children}
    </div>
  );
}
