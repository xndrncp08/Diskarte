"use client";

import { usePathname, useRouter } from "next/navigation";
import { Home, LayoutGrid, MessageCircle, UserRound } from "lucide-react";
import { useEffect, useRef, type RefObject } from "react";
import { useOptionalSocial } from "@/components/providers/SocialProvider";
import { useCall } from "@/components/voice/CallProvider";
import { useKeyboardUp } from "@/hooks/useAppViewport";
import { BottomTabBar } from "../Nav";
import { CallStrip } from "./CallStrip";

export type PhoneTab = "home" | "people" | "spaces" | "you";

// The top-level screens under /tambayan and the tab each belongs to; "" is /tambayan itself.
const TOP = new Map<string, PhoneTab>([["", "home"], ["search", "home"], ["admin", "home"], ["messages", "people"], ["friends", "people"], ["spaces", "spaces"], ["explore", "spaces"], ["you", "you"]]);

const parts = (pathname: string) => pathname.replace(/\/+$/, "").split("/").slice(2); // after "", "tambayan"

/**
 * The tab a phone screen belongs to, or null when it is a conversation (a DM, a room, a Space's workspace or board)
 * and gets the whole screen. A Space's landing is a Spaces screen.
 */
export function phoneTab(pathname: string): PhoneTab | null {
  const [first = "", second] = parts(pathname);
  if (second !== undefined) return null;
  return TOP.get(first) ?? (first === "dm" ? null : "spaces");
}

/** Where a conversation's Back goes: a DM to People, anything inside a Space to its landing. Null on top-level screens. */
export function backTarget(pathname: string): string | null {
  const [first = "", second] = parts(pathname);
  if (second === undefined || TOP.has(first)) return null;
  return first === "dm" ? "/tambayan/messages" : `/tambayan/${first}`;
}

// The path before the current one, so Back can return through history when it came from the parent screen.
let previousPath: string | null = null;

/** Back from a conversation: through history when you came from its parent (keeps that screen's scroll), else to the parent (deep links). */
export function useBack() {
  const pathname = usePathname();
  const router = useRouter();
  const href = backTarget(pathname);
  return { href, back: () => (href === null ? undefined : previousPath === href ? router.back() : router.push(href)) };
}

const phone = () => !window.matchMedia?.("(min-width: 768px)").matches;

/**
 * Phone navigation side effects, run once by the Pulse shell: remembers the previous path for Back, slides a
 * conversation in from the right when it opens from a top-level screen (only under `pulse-motion`, via the canvas's
 * `data-enter`), and moves focus to the new screen's h1 (else the canvas) so screen readers land on it.
 */
export function usePhoneNavigation(canvas: RefObject<HTMLElement | null>) {
  const pathname = usePathname();
  const last = useRef<string | null>(null);
  useEffect(() => {
    const prev = last.current;
    last.current = pathname;
    previousPath = prev;
    if (prev === null || prev === pathname || !phone()) return;
    const el = canvas.current;
    if (el && backTarget(pathname) && !backTarget(prev)) {
      el.removeAttribute("data-enter");
      void el.offsetWidth; // restart the animation
      el.setAttribute("data-enter", "");
    }
    // After the drawer (if any) has closed and handed focus back.
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => {
      const h1 = document.querySelector<HTMLElement>("#main-content h1");
      if (h1 && !h1.hasAttribute("tabindex")) h1.tabIndex = -1;
      (h1 ?? document.getElementById("main-content"))?.focus({ preventScroll: true });
    }));
    return () => cancelAnimationFrame(frame);
  }, [pathname, canvas]);
}

/**
 * Pulse's phone bottom area (below md): the live call strip, then the four destinations (Home · People · Spaces · You)
 * on top-level screens only. Conversations get the whole screen; while the on-screen keyboard is up both step aside
 * so the composer or search field stays in view.
 */
export function PulseMobileNavigation() {
  const pathname = usePathname();
  const attention = useOptionalSocial()?.attention ?? 0;
  const call = useCall();
  const keyboard = useKeyboardUp();
  const tab = phoneTab(pathname);
  const inCall = call.status !== "idle" && !!call.target;
  if (keyboard || (!tab && !inCall)) return null;
  return (
    <div className="shrink-0 md:hidden" data-testid="pulse-phone-nav">
      {/* shortcut: un-hides the default (tablet) strip on phones; render <CallStrip compact /> once the voice step adds it. */}
      {inCall && <div className="[&>[data-testid=call-dock]]:flex">
        <CallStrip />
      </div>}
      {tab ? (
        <BottomTabBar
          label="Main destinations"
          items={[
            { href: "/tambayan", label: "Home", icon: <Home />, current: tab === "home" },
            { href: "/tambayan/messages", label: "People", icon: <MessageCircle />, current: tab === "people", count: attention, countLabel: "unread" },
            { href: "/tambayan/spaces", label: "Spaces", icon: <LayoutGrid />, current: tab === "spaces" },
            { href: "/tambayan/you", label: "You", icon: <UserRound />, current: tab === "you" },
          ]}
        />
      ) : (
        <div className="pb-[env(safe-area-inset-bottom)]" aria-hidden />
      )}
    </div>
  );
}
