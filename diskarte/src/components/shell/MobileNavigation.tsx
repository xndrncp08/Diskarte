"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Home, MessageCircle, Mic, MicOff, PhoneOff, UserRound } from "lucide-react";
import { useSettingsDialog } from "@/components/profile/SettingsDialog";
import { useOptionalSocial } from "@/components/providers/SocialProvider";
import { callHref, useCall } from "@/components/voice/CallProvider";
import { useLocale } from "@/lib/locale";
import { useShellUI } from "./ShellUI";

/** Top-level screens get the tab bar; inside a channel or DM the conversation has the whole screen. */
export const TAB_SCREENS = ["/tambayan", "/tambayan/messages", "/tambayan/explore", "/tambayan/friends"];

export function MobileNavigation() {
  const pathname = usePathname();
  const { t } = useLocale();
  const settings = useSettingsDialog();
  const attention = useOptionalSocial()?.attention ?? 0;
  const { setNavOpen, navOpen } = useShellUI();
  const call = useCall();
  const tabs = TAB_SCREENS.includes(pathname);
  const inCall = !!call.target && call.status !== "idle" && !navOpen;
  if (!tabs && !inCall) return null;
  const item = "relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold text-slate-400 aria-[current=page]:text-sun active:bg-white/10";
  return (
    // Same colour as the page behind the app, so the bottom of the screen reads as one surface.
    <div className="mobile-navigation shrink-0 border-t border-white/10 md:hidden">
      {inCall && call.target && (
        <div className="call-strip flex items-center gap-1 border-b border-white/10 px-3" data-testid="mobile-call-strip">
          <Link href={callHref(call.target)} className="min-w-0 flex-1 py-2 text-sm">
            <span className="block truncate font-semibold text-signal-green">{call.status === "connected" ? call.target.channelName : `${call.status === "reconnecting" ? "Reconnecting" : "Connecting"}…`}</span>
            <span className="text-xs text-slate-400">{t("Return to call")}</span>
          </Link>
          <button type="button" onClick={() => void call.toggleMute()} aria-label={call.muted ? "Unmute call" : "Mute call"} aria-pressed={call.muted} className="flex size-11 items-center justify-center rounded-xl hover:bg-white/10">
            {call.muted ? <MicOff className="size-5 text-red-300" /> : <Mic className="size-5" />}
          </button>
          <button type="button" onClick={call.leave} aria-label={t("Leave call")} className="flex size-11 items-center justify-center rounded-xl text-red-300 hover:bg-red-500/10"><PhoneOff className="size-5" /></button>
        </div>
      )}
      {tabs && <nav aria-label={t("Main destinations")} className="mobile-tabs flex gap-1 px-2 pb-safe pt-1">
        <Link href="/tambayan" onClick={() => setNavOpen(false)} aria-current={pathname === "/tambayan" ? "page" : undefined} className={item}><Home className="size-5" aria-hidden />{t("Home")}</Link>
        <Link href="/tambayan/messages" onClick={() => setNavOpen(false)} aria-current={pathname === "/tambayan/messages" ? "page" : undefined} className={item}>
          <MessageCircle className="size-5" aria-hidden />{t("Messages")}
          {attention > 0 && <span className="absolute right-3 top-0 rounded-full bg-red-600 px-1.5 text-[10px] text-white">{attention > 99 ? "99+" : attention}<span className="sr-only"> unread</span></span>}
        </Link>
        <Link href="/tambayan/explore" onClick={() => setNavOpen(false)} aria-current={pathname === "/tambayan/explore" ? "page" : undefined} className={item}><Compass className="size-5" aria-hidden />{t("Explore")}</Link>
        <button type="button" onClick={() => settings?.openSettings("profile")} className={item}><UserRound className="size-5" aria-hidden />{t("Profile")}</button>
      </nav>}
      {!tabs && <div className="pb-safe" aria-hidden />}
    </div>
  );
}
