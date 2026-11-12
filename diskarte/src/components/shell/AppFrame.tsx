"use client";

import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";
import { BroadcastBanner } from "@/components/broadcast/BroadcastBanner";
import { PushBadge } from "@/components/notifications/PushBadge";
import { useNavDrawer } from "@/components/shell/AppShell";
import { ServerRail, type RailEntry } from "@/components/shell/ServerRail";
import { MobileNavigation } from "@/components/shell/MobileNavigation";
import type { Shell } from "@/lib/shell";
import { useShellUI } from "@/components/shell/ShellUI";
import { ResizeHandle } from "@/components/workspace/ResizeHandle";
import { NAV_WIDTH, useIsCanvas, useLayout } from "@/components/workspace/WorkspaceProvider";
import { useAppViewport } from "@/hooks/useAppViewport";
import { useSwipeDrawer } from "@/hooks/useSwipeDrawer";
import { cn } from "@/lib/utils";
import { PulseMenuSkin } from "@/components/pulse/Menu";
import { PulseTooltipSkin } from "@/components/pulse/Tooltip";
import { CallStrip } from "@/components/pulse/shell/CallStrip";
import { PulseMobileNavigation, standalone, useBack, usePhoneNavigation, useShortScreen } from "@/components/pulse/shell/MobileTabs";
import { Navigator } from "@/components/pulse/shell/Navigator";
import { PulseUIProvider } from "@/components/pulse/shell/PulseUI";

// The navigator shares Classic's saved column width, but never narrower than Pulse's 280 px.
const PULSE_NAV = { ...NAV_WIDTH, min: 280, initial: 280 };

/** One frame identity for both presentations: the conversation, uploads and subscriptions never remount on a switch. */
export function AppFrame({ servers, children, shell }: { servers: RailEntry[]; children: ReactNode; shell: Shell }) {
  const pulse = shell === "pulse";
  const { navOpen, setNavOpen } = useShellUI();
  const back = useBack();
  // In a conversation the left-edge swipe goes Back (as the masthead's Back button does), but only in the installed app:
  // in a browser tab the browser's own edge swipe already goes back, and both would fire.
  const swipe = useSwipeDrawer(navOpen, (open) => {
    if (pulse && open && !standalone()) return;
    if (pulse && open && back.href) back.back();
    else setNavOpen(open);
  });
  // Short landscape (a phone on its side) is wider than md but keeps the navigator as a drawer.
  const short = useShortScreen();
  const desktop = useIsCanvas() && (!pulse || !short);
  const [layout, setLayout] = useLayout();
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  useAppViewport(frame);
  usePhoneNavigation(canvas, pulse);
  useNavDrawer(frame, navOpen, desktop, setNavOpen);
  // Every navigator row is a link: following one on a phone closes the drawer.
  useEffect(() => setNavOpen(false), [pathname, shell, setNavOpen]);
  const width = Math.min(PULSE_NAV.max, Math.max(PULSE_NAV.min, layout.nav));

  return (
    <PulseUIProvider>
      <PulseMenuSkin active={pulse}>
      <PulseTooltipSkin active={pulse}>
        <div ref={frame} className={cn("app-viewport relative flex h-dvh overflow-hidden", pulse ? "bg-pulse-bg font-pulse-text text-pulse-text" : "diskarte-backdrop")} data-testid="shell" data-pulse-shell={pulse ? "" : undefined} {...swipe}>
          <PushBadge />
          <a href="#main-content" className={cn("sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:px-4 focus:py-2 focus:font-semibold", pulse ? "focus:z-(--pulse-z-overlay) focus:rounded-pulse-control focus:bg-pulse-accent focus:text-pulse-on-accent" : "focus:z-[60] focus:rounded-lg focus:bg-sun focus:text-abyss")}>
            Skip to content
          </a>
          <AnimatePresence>
            {navOpen && (
              <motion.button
                type="button"
                aria-label="Close navigation"
                className={cn("fixed inset-0 z-30", pulse ? "bg-pulse-scrim" : "bg-black/50 backdrop-blur-sm", desktop && "md:hidden")}
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
            style={pulse ? { "--pulse-nav-w": `${width}px` } as React.CSSProperties : undefined}
            className={cn(
              "fixed inset-y-0 left-0 z-40 transition-transform duration-200 ease-out",
              pulse ? "flex w-[min(22rem,calc(100vw-3rem))] border-r border-pulse-line" : "md:relative md:z-10 md:flex md:translate-x-0",
              pulse && (desktop ? "md:relative md:z-10 md:w-(--pulse-nav-w) md:shrink-0 md:translate-x-0 md:border-r-0" : "bg-pulse-bg pl-[env(safe-area-inset-left)]"),
              navOpen ? "translate-x-0" : "-translate-x-full",
            )}
          >
            {pulse ? <Navigator servers={servers} /> : <ServerRail servers={servers} />}
            {pulse && desktop && <ResizeHandle label="Resize navigator" side="right" value={width} {...PULSE_NAV} onChange={(nav) => setLayout({ nav })} />}
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <BroadcastBanner />
            {pulse && <CallStrip />}
            <div ref={canvas} className={cn("relative flex min-h-0 min-w-0 flex-1", pulse && "max-md:pulse-motion:data-enter:animate-pulse-enter")} data-workspace="">
              {children}
            </div>
            {pulse ? <PulseMobileNavigation /> : <MobileNavigation />}
          </div>
        </div>
      </PulseTooltipSkin>
      </PulseMenuSkin>
    </PulseUIProvider>
  );
}

