"use client";
import { useEffect } from "react";
import { useOptionalSocial } from "@/components/providers/SocialProvider";
import { isUnread, useOptionalUnreads } from "@/components/providers/UnreadsProvider";
import { isUnread as dmUnread } from "@/lib/social";
export function PushBadge() {
  const social = useOptionalSocial(), unreads = useOptionalUnreads();
  const count = (social?.conversations?.filter(dmUnread).length ?? 0) + [...(unreads?.channels.values() ?? [])].filter(isUnread).length;
  const ready = social?.conversations !== null && !!unreads;
  useEffect(() => {
    if (!ready) return;
    const badges = navigator as Navigator & { setAppBadge?(count: number): Promise<void>; clearAppBadge?(): Promise<void> };
    void (count ? badges.setAppBadge?.(Math.min(count,9999)) : badges.clearAppBadge?.())?.catch(() => undefined);
  }, [count, ready]);
  return null;
}
