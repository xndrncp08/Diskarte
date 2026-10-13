"use client";

import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef } from "react";
import { useMe } from "@/components/providers/MeProvider";
import { useOptionalSupabase } from "@/components/providers/RuntimeConfig";
import { useOptionalSocial } from "@/components/providers/SocialProvider";
import { desktopNotify, readNotifyPrefs } from "@/lib/notify-prefs";
import { conversationTitle, isUnread } from "@/lib/social";

/**
 * Desktop notifications for DMs (Settings → Notifications): watches the live conversation list and
 * announces a conversation that just got a new message you haven't seen, unless you're looking at it.
 * The in-app sound and unread dot already come from the DM hooks.
 */
export function DmNotifier() {
  const social = useOptionalSocial();
  const supabase = useOptionalSupabase();
  const { me } = useMe();
  const router = useRouter();
  const seen = useRef<Map<string, string> | null>(null);

  const announce = useEffectEvent(async (conversationId: string, title: string) => {
    if (!supabase || !readNotifyPrefs().dms) return;
    const { data } = await supabase.from("direct_messages").select("id, content, author_id").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!data || data.author_id === me.id) return;
    desktopNotify({ title, body: data.content || "Sent an attachment", tag: data.id, href: `/tambayan/dm/${conversationId}`, open: (to) => router.push(to) });
  });

  const conversations = social?.conversations;
  useEffect(() => {
    if (!conversations) return;
    const previous = seen.current;
    seen.current = new Map(conversations.map((c) => [c.id, c.lastMessageAt]));
    // The first load is history, not news.
    if (!previous) return;
    for (const c of conversations) {
      const before = previous.get(c.id);
      if (before && Date.parse(c.lastMessageAt) > Date.parse(before) && isUnread(c)) void announce(c.id, conversationTitle(c));
    }
  }, [conversations]);

  return null;
}
