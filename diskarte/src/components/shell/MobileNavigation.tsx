"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Home, MessageCircle, Mic, MicOff, PhoneOff, UserRound } from "lucide-react";
import { useSettingsDialog } from "@/components/profile/SettingsDialog";
import { useOptionalSocial } from "@/components/providers/SocialProvider";
import { callHref, useCall } from "@/components/voice/CallProvider";
import { useShellUI } from "./ShellUI";

export function MobileNavigation() {
  const pathname = usePathname();
  const settings = useSettingsDialog();
  const attention = useOptionalSocial()?.attention ?? 0;
  const { setNavOpen, navOpen } = useShellUI();
  const call = useCall();
  const item = "relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold text-slate-400 aria-[current=page]:text-sun active:bg-white/10";
  return (
    <div className="mobile-navigation shrink-0 border-t border-white/10 bg-midnight/95 md:hidden">
      {call.target && call.status !== "idle" && !navOpen && (
        <div className="flex items-center gap-1 border-b border-white/10 px-3" data-testid="mobile-call-strip">
          <Link href={callHref(call.target)} className="min-w-0 flex-1 py-2 text-sm">
            <span className="block truncate font-semibold text-signal-green">{call.status === "connected" ? call.target.channelName : `${call.status === "reconnecting" ? "Reconnecting" : "Connecting"}…`}</span>
            <span className="text-xs text-slate-400">Return to call</span>
          </Link>
          <button type="button" onClick={() => void call.toggleMute()} aria-label={call.muted ? "Unmute call" : "Mute call"} aria-pressed={call.muted} className="flex size-11 items-center justify-center rounded-xl hover:bg-white/10">
            {call.muted ? <MicOff className="size-5 text-red-300" /> : <Mic className="size-5" />}
          </button>
          <button type="button" onClick={call.leave} aria-label="Leave call" className="flex size-11 items-center justify-center rounded-xl text-red-300 hover:bg-red-500/10"><PhoneOff className="size-5" /></button>
        </div>
      )}
      <nav aria-label="Main destinations" className="mobile-tabs flex gap-1 px-2 pb-safe pt-1">
        <Link href="/tambayan" onClick={() => setNavOpen(false)} aria-current={pathname === "/tambayan" ? "page" : undefined} className={item}><Home className="size-5" aria-hidden />Home</Link>
        <Link href="/tambayan/messages" onClick={() => setNavOpen(false)} aria-current={pathname.includes("/messages") || pathname.includes("/dm/") ? "page" : undefined} className={item}>
          <MessageCircle className="size-5" aria-hidden />Messages
          {attention > 0 && <span className="absolute right-3 top-0 rounded-full bg-red-600 px-1.5 text-[10px] text-white">{attention > 99 ? "99+" : attention}<span className="sr-only"> unread</span></span>}
        </Link>
        <Link href="/tambayan/explore" onClick={() => setNavOpen(false)} aria-current={pathname === "/tambayan/explore" ? "page" : undefined} className={item}><Compass className="size-5" aria-hidden />Explore</Link>
        <button type="button" onClick={() => settings?.openSettings("profile")} className={item}><UserRound className="size-5" aria-hidden />Profile</button>
      </nav>
    </div>
  );
}
