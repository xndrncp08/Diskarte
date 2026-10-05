"use client";

import Link from "next/link";
import { Bell, MessageCircle, UserPlus } from "lucide-react";
import { useOptionalSocial } from "@/components/providers/SocialProvider";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { Popover } from "@/components/ui/Popover";
import { Tooltip } from "@/components/ui/Tooltip";
import { conversationTitle, isUnread } from "@/lib/social";
import { cn } from "@/lib/utils";

/**
 * The rail's notification hub: incoming friend requests and unread conversations in one place, each
 * a link straight to where you can act on it.
 */
export function NotificationHub() {
  const social = useOptionalSocial();
  const attention = social?.attention ?? 0;
  const requests = (social?.friends ?? []).filter((f) => f.status === "incoming");
  const unread = (social?.conversations ?? []).filter(isUnread).slice(0, 8);

  return (
    <Popover
      label="Notifications"
      side="right"
      align="end"
      testId="notification-hub"
      className="w-80"
      trigger={({ toggle, ref, open, ...aria }) => (
        <Tooltip label="Notifications" side="right">
          <button
            ref={ref}
            type="button"
            onClick={toggle}
            {...aria}
            aria-label={attention ? `Notifications (${attention} new)` : "Notifications"}
            className={cn(
              "relative flex size-11 items-center justify-center rounded-2xl text-slate-300 transition-colors hover:bg-white/10 hover:text-white",
              open && "bg-white/10 text-white",
            )}
          >
            <Bell className="size-5" aria-hidden />
            {attention > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full border-2 border-abyss bg-red-600 px-1 font-silk text-[10px] font-bold tabular-nums text-white" aria-hidden>
                {attention > 9 ? "9+" : attention}
              </span>
            )}
          </button>
        </Tooltip>
      )}
    >
      {(close) => (
        <div className="p-2">
          <p className="px-2 pb-2 pt-1 font-silk text-[10px] uppercase tracking-widest text-slate-400">Notifications</p>
          {requests.length === 0 && unread.length === 0 ? (
            <p className="px-2 pb-3 text-sm text-slate-400">You&apos;re all caught up.</p>
          ) : (
            <ul className="space-y-0.5">
              {requests.map((r) => {
                const profile = social?.profiles.get(r.userId);
                return (
                  <li key={`req:${r.userId}`}>
                    <Link href="/tambayan/friends" onClick={close} className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm text-slate-200 hover:bg-white/10">
                      {profile ? <UserAvatar profile={profile} size={32} /> : <UserPlus className="size-5 text-sun" aria-hidden />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-white">{profile?.display_name ?? "Someone"}</span>
                        <span className="block text-xs text-slate-400">sent you a friend request</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
              {unread.map((c) => (
                <li key={`dm:${c.id}`}>
                  <Link href={`/tambayan/dm/${c.id}`} onClick={close} className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm text-slate-200 hover:bg-white/10">
                    {c.others[0] ? <UserAvatar profile={c.others[0]} size={32} /> : <MessageCircle className="size-5 text-neon" aria-hidden />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-white">{conversationTitle(c)}</span>
                      <span className="block text-xs text-slate-400">New messages</span>
                    </span>
                    <span className="size-2 shrink-0 rounded-full bg-neon" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Popover>
  );
}
