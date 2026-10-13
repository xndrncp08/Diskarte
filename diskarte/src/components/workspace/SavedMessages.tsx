"use client";

import Link from "next/link";
import { BookmarkX, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useOptionalSupabase } from "@/components/providers/RuntimeConfig";

interface SavedItem {
  id: string;
  content: string;
  href: string;
  author: string;
}

/** Your saved messages (Discord's bookmarks), newest saved first, each opening its channel. */
export function SavedMessages({ onOpen }: { onOpen: () => void }) {
  const supabase = useOptionalSupabase();
  const [items, setItems] = useState<SavedItem[] | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let live = true;
    void (async () => {
      const { data: saved } = await supabase.from("saved_messages").select("message_id, saved_at").order("saved_at", { ascending: false }).limit(50);
      const ids = (saved ?? []).map((s) => s.message_id);
      if (!ids.length) return live && setItems([]);
      const { data: messages } = await supabase.from("messages").select("id, content, channel_id, server_id, author_id").in("id", ids);
      const authorIds = Array.from(new Set((messages ?? []).flatMap((m) => (m.author_id ? [m.author_id] : []))));
      const { data: people } = authorIds.length ? await supabase.from("profiles").select("id, display_name").in("id", authorIds) : { data: [] };
      const names = new Map((people ?? []).map((p) => [p.id, p.display_name]));
      const byId = new Map((messages ?? []).map((m) => [m.id, m]));
      // Saved order; messages you can no longer read simply drop out.
      const list = ids.flatMap((id) => {
        const m = byId.get(id);
        return m ? [{ id, content: m.content || "(attachment)", href: `/tambayan/${m.server_id}/${m.channel_id}`, author: (m.author_id && names.get(m.author_id)) || "Someone" }] : [];
      });
      if (live) setItems(list);
    })();
    return () => {
      live = false;
    };
  }, [supabase]);

  async function remove(id: string) {
    setItems((prev) => prev?.filter((i) => i.id !== id) ?? null);
    await supabase?.from("saved_messages").delete().eq("message_id", id);
  }

  if (!items) return <Loader2 className="mx-auto my-4 size-5 animate-spin text-slate-500" aria-label="Loading saved messages" />;
  if (items.length === 0) return <p className="px-2 pb-3 text-sm text-slate-400">Nothing saved yet. Right-click a message → Save Message.</p>;
  return (
    <ul className="scrollbar-thin max-h-96 space-y-0.5 overflow-y-auto" aria-label="Saved messages">
      {items.map((item) => (
        <li key={item.id} className="group flex items-start gap-1 rounded-xl hover:bg-white/10">
          <Link href={item.href} onClick={onOpen} className="min-w-0 flex-1 px-2 py-2 text-sm">
            <span className="block truncate font-semibold text-white">{item.author}</span>
            <span className="line-clamp-2 text-xs text-slate-400">{item.content}</span>
          </Link>
          <button type="button" onClick={() => void remove(item.id)} aria-label="Remove from Saved" className="m-1 rounded-md p-1.5 text-slate-500 opacity-0 hover:bg-white/10 hover:text-white focus:opacity-100 group-hover:opacity-100">
            <BookmarkX className="size-4" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
