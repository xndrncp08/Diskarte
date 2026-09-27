"use client";

import { useRouter } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useEffect, type ReactNode } from "react";
import { useSwipeDrawer } from "@/hooks/useSwipeDrawer";
import { MeProvider } from "@/components/providers/MeProvider";
import { PresenceProvider } from "@/components/providers/PresenceProvider";
import { SocialProvider } from "@/components/providers/SocialProvider";
import { CallProvider } from "@/components/voice/CallProvider";
import { FloatingCallHUD } from "@/components/voice/FloatingCallHUD";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import type { Server } from "@/lib/servers";
import type { Tables } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { ServerRail } from "./ServerRail";
import { ShellUIProvider, useShellUI } from "./ShellUI";

/** Refreshes the server list when this user joins/leaves/is kicked from any Tambayan (e.g. in another tab). */
function MembershipWatcher({ userId }: { userId: string }) {
  const supabase = useSupabase();
  const router = useRouter();
  useEffect(() => {
    const channel = supabase
      .channel(`db:memberships:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "members", filter: `user_id=eq.${userId}` }, () => router.refresh())
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "members" }, ({ old }) => {
        if ((old as { user_id?: string }).user_id === userId) router.refresh();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, router]);
  return null;
}

function Frame({ servers, children }: { servers: Server[]; children: ReactNode }) {
  const { navOpen, setNavOpen } = useShellUI();
  const swipe = useSwipeDrawer(navOpen, setNavOpen);
  return (
    <div className="diskarte-backdrop relative flex h-dvh overflow-hidden" data-testid="shell" {...swipe}>
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
          "fixed inset-y-0 left-0 z-40 transition-transform duration-200 ease-out md:static md:z-auto md:translate-x-0",
          navOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <ServerRail servers={servers} />
      </div>
      {/* No z-index here: a stacking context would trap the mobile drawer panels (z-40) beneath the
          drawer backdrop (z-30), making the channel sidebar untappable on phones. */}
      <div id="main-content" tabIndex={-1} className="relative flex min-w-0 flex-1 outline-none">
        {children}
      </div>
      <FloatingCallHUD />
    </div>
  );
}

export function AppShell({ profile, verified = true, servers, children }: { profile: Tables<"profiles">; verified?: boolean; servers: Server[]; children: ReactNode }) {
  return (
    <MeProvider profile={profile} verified={verified}>
      {/* Honour the OS "reduce motion" setting for every framer-motion animation in the app. */}
      <MotionConfig reducedMotion="user">
        <PresenceProvider>
          <SocialProvider>
            <CallProvider>
              <ShellUIProvider>
                <MembershipWatcher userId={profile.id} />
                <Frame servers={servers}>{children}</Frame>
              </ShellUIProvider>
            </CallProvider>
          </SocialProvider>
        </PresenceProvider>
      </MotionConfig>
    </MeProvider>
  );
}

/** Wraps a secondary sidebar so it joins the rail in the mobile drawer. */
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
