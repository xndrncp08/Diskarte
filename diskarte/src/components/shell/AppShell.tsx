"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, type ReactNode, type RefObject } from "react";
import { useMe } from "@/components/providers/MeProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { subscribeDbChanges } from "@/lib/realtime";
import { cn } from "@/lib/utils";
import type { Server } from "@/lib/servers";
import { ConfirmHost } from "@/components/ui/ConfirmHost";
import { AdminAccessProvider } from "@/components/admin/AdminAccess";
import type { PlatformRole } from "@/lib/admin";
import { useLayout, WorkspaceProvider } from "@/components/workspace/WorkspaceProvider";
import { UnreadsProvider } from "@/components/providers/UnreadsProvider";
import { AppBadge, DmNotifier } from "./DmNotifier";
import { ReminderWatcher } from "@/components/chat/Reminders";
import { AppFrame } from "@/components/shell/AppFrame";
import type { Shell } from "@/lib/shell";
import { ShellKindContext } from "./ShellKind";
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

/**
 * The phone drawer's keyboard contract, shared by both shells: focus its first control on open, trap Tab inside it,
 * Escape or Back closes it, and focus returns where it was.
 */
export function useNavDrawer(frame: RefObject<HTMLElement | null>, navOpen: boolean, desktop: boolean, setNavOpen: (open: boolean) => void) {
  useEffect(() => {
    if (!navOpen || desktop) return;
    const previous = document.activeElement as HTMLElement | null;
    const controls = () => Array.from(frame.current?.querySelectorAll<HTMLElement>("[data-mobile-navigation] a[href], [data-mobile-navigation] button:not([disabled]), [data-mobile-navigation] input") ?? []).filter((el) => el.getClientRects().length > 0);
    // Start on where you are (the innermost current link: the channel, not its server), else the first control.
    const first = controls();
    (first.filter((el) => el.getAttribute("aria-current") === "page").at(-1) ?? first[0])?.focus();
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
  }, [frame, navOpen, desktop, setNavOpen]);
}

/** Classic's frame: the server rail, then the columns (channels · main · members) that the pages render. */
export function ClassicFrame({ servers, children }: { servers: Server[]; children: ReactNode }) {
  return <AppFrame servers={servers} shell="classic">{children}</AppFrame>;
}

/** Bridges the shell's member toggle to the saved layout. */
export function ShellUIBridge({ children }: { children: ReactNode }) {
  const [layout, setLayout] = useLayout();
  const setOpen = useCallback((membersOpen: boolean) => setLayout({ membersOpen }), [setLayout]);
  const members = useMemo(() => ({ open: layout.membersOpen, setOpen }), [layout.membersOpen, setOpen]);
  return <ShellUIProvider members={members}>{children}</ShellUIProvider>;
}

/**
 * Everything both shells share and that must survive switching between them (the tambayan layout keeps this
 * mounted and swaps only the frame inside it): admin access, column layout, unreads, the shell toggles, the
 * membership/DM/reminder watchers and the confirm host. Session state (the call, presence, friends) lives
 * above it in <SessionProviders>.
 */
export function ShellProviders({ platformRole = "member", shell = "classic", children }: { platformRole?: PlatformRole; shell?: Shell; children: ReactNode }) {
  const { me } = useMe();
  return (
    <AdminAccessProvider role={platformRole}>
      <ShellKindContext.Provider value={shell}>
        <WorkspaceProvider>
          <UnreadsProvider>
            <ShellUIBridge>
              <MembershipWatcher userId={me.id} />
              <DmNotifier />
              <ReminderWatcher />
              <AppBadge />
              {children}
              <ConfirmHost />
            </ShellUIBridge>
          </UnreadsProvider>
        </WorkspaceProvider>
      </ShellKindContext.Provider>
    </AdminAccessProvider>
  );
}

/** The Classic app (shared providers and the Classic frame) in one piece, for standalone renders and tests. */
export function AppShell({ servers, platformRole = "member", children }: { servers: Server[]; platformRole?: PlatformRole; children: ReactNode }) {
  return (
    <ShellProviders platformRole={platformRole}>
      <ClassicFrame servers={servers}>{children}</ClassicFrame>
    </ShellProviders>
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
