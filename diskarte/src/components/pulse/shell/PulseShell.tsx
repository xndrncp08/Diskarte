"use client";

import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";
import { BroadcastBanner } from "@/components/broadcast/BroadcastBanner";
import { PushBadge } from "@/components/notifications/PushBadge";
import { useNavDrawer } from "@/components/shell/AppShell";
import type { RailEntry } from "@/components/shell/ServerRail";
import { useShellUI } from "@/components/shell/ShellUI";
import { ResizeHandle } from "@/components/workspace/ResizeHandle";
import { NAV_WIDTH, useIsCanvas, useLayout } from "@/components/workspace/WorkspaceProvider";
import { useAppViewport } from "@/hooks/useAppViewport";
import { useSwipeDrawer } from "@/hooks/useSwipeDrawer";
import { cn } from "@/lib/utils";
import { PulseMenuSkin } from "../Menu";
import { PulseTooltipSkin } from "../Tooltip";
import { CallStrip } from "./CallStrip";
import { PulseMobileNavigation, useBack, usePhoneNavigation } from "./MobileTabs";
import { Navigator } from "./Navigator";
import { PulseUIProvider } from "./PulseUI";

// The navigator shares Classic's saved column width, but never narrower than Pulse's 280 px.
const PULSE_NAV = { ...NAV_WIDTH, min: 280, initial: 280 };

/**
 * The Pulse frame ("Canvas"): the Spaces navigator on the left (resizable on tablets and up, a full-height drawer on
 * phones), then the canvas column: broadcast banner, the live call strip, the page (its WorkspacePanel "main" is
 * the canvas; its "nav" panel renders nothing here) and, on phones, the call strip and tab bar (PulseMobileNavigation). Rendered inside ShellProviders, so switching shells keeps the
 * call, unreads and watchers mounted. Reused Classic menus take the Pulse skin.
 */
export function PulseShell({ servers, children }: { servers: RailEntry[]; children: ReactNode }) {
  const { navOpen, setNavOpen } = useShellUI();
  const back = useBack();
  // In a conversation the left-edge swipe goes Back (as the masthead's Back button does) instead of opening the drawer.
  const swipe = useSwipeDrawer(navOpen, (open) => (open && back.href ? back.back() : setNavOpen(open)));
  const desktop = useIsCanvas();
  const [layout, setLayout] = useLayout();
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  useAppViewport(frame);
  usePhoneNavigation(canvas);
  useNavDrawer(frame, navOpen, desktop, setNavOpen);
  // Every navigator row is a link: following one on a phone closes the drawer.
  useEffect(() => setNavOpen(false), [pathname, setNavOpen]);
  const width = Math.min(PULSE_NAV.max, Math.max(PULSE_NAV.min, layout.nav));

  return (
    <PulseUIProvider>
      <PulseMenuSkin>
      <PulseTooltipSkin>
        <div ref={frame} className="app-viewport relative flex h-dvh overflow-hidden bg-pulse-bg font-pulse-text text-pulse-text" data-testid="shell" data-pulse-shell="" {...swipe}>
          <PushBadge />
          <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-(--pulse-z-overlay) focus:rounded-pulse-control focus:bg-pulse-accent focus:px-4 focus:py-2 focus:font-semibold focus:text-pulse-on-accent">
            Skip to content
          </a>
          <AnimatePresence>
            {navOpen && (
              <motion.button
                type="button"
                aria-label="Close navigation"
                className="fixed inset-0 z-30 bg-pulse-scrim md:hidden"
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
            style={{ "--pulse-nav-w": `${width}px` } as React.CSSProperties}
            className={cn(
              "fixed inset-y-0 left-0 z-40 flex w-[min(22rem,calc(100vw-3rem))] border-r border-pulse-line transition-transform duration-200 ease-out md:relative md:z-10 md:w-(--pulse-nav-w) md:shrink-0 md:translate-x-0 md:border-r-0",
              navOpen ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <Navigator servers={servers} />
            <ResizeHandle label="Resize navigator" side="right" value={width} {...PULSE_NAV} onChange={(nav) => setLayout({ nav })} />
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <BroadcastBanner />
            <CallStrip />
            <div ref={canvas} className="relative flex min-h-0 min-w-0 flex-1 max-md:pulse-motion:data-enter:animate-pulse-enter" data-workspace="">
              {children}
            </div>
            <PulseMobileNavigation />
          </div>
        </div>
      </PulseTooltipSkin>
      </PulseMenuSkin>
    </PulseUIProvider>
  );
}
