"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { useOptionalSocial } from "@/components/providers/SocialProvider";
import { useSettingsDialog } from "@/components/profile/SettingsDialog";
import { useShellUI } from "@/components/shell/ShellUI";
import { FloatingWindow } from "@/components/ui/FloatingWindow";
import { conversationTitle } from "@/lib/social";
import type { Server } from "@/lib/servers";

export function CommandPalette({ servers, onClose }: { servers: Server[]; onClose: () => void }) {
  const router = useRouter();
  const supabase = useSupabase();
  const social = useOptionalSocial();
  const settings = useSettingsDialog();
  const { setNavOpen } = useShellUI();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [channels, setChannels] = useState<{ id: string; server_id: string; name: string }[]>([]);
  const [error, setError] = useState(false);
  const listId = useId();
  useEffect(() => {
    if (!servers.length) return;
    let live = true;
    void supabase.from("channels").select("id,server_id,name").in("server_id", servers.map((s) => s.id)).order("position").limit(500).then(({ data, error }) => {
      if (live) { setChannels(data ?? []); setError(!!error); }
    });
    return () => { live = false; };
  }, [supabase, servers]);
  const go = (href: string) => { onClose(); setNavOpen(false); router.push(href); };
  const entries = [
    { id: "home", label: "Home", run: () => go("/tambayan") },
    { id: "messages", label: "Messages", run: () => go("/tambayan/messages") },
    { id: "friends", label: "Friends", run: () => go("/tambayan/friends") },
    { id: "explore", label: "Explore communities", run: () => go("/tambayan/explore") },
    ...(settings ? [{ id: "settings", label: "User settings", run: () => { onClose(); settings.openSettings(); } }] : []),
    ...servers.map((s) => ({ id: s.id, label: s.name, run: () => go(`/tambayan/${s.id}`) })),
    ...(social?.conversations ?? []).map((c) => ({ id: c.id, label: `DM · ${conversationTitle(c)}`, run: () => go(`/tambayan/dm/${c.id}`) })),
    ...channels.map((c) => ({ id: c.id, label: `#${c.name} · ${servers.find((s) => s.id === c.server_id)?.name ?? "Tambayan"}`, run: () => go(`/tambayan/${c.server_id}/${c.id}`) })),
  ].filter((entry) => entry.label.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim())).slice(0, 50);
  const active = Math.min(selected, Math.max(0, entries.length - 1));
  return <FloatingWindow id="command-palette" title="Go anywhere" open onClose={onClose} className="w-[min(38rem,calc(100vw-2rem))]">
    <input data-autofocus type="search" role="combobox" aria-label="Find a channel, conversation or destination" aria-expanded="true" aria-controls={listId} aria-activedescendant={entries[active] ? `${listId}-${entries[active].id}` : undefined} value={query} onChange={(e) => { setQuery(e.target.value); setSelected(0); }} onKeyDown={(e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setSelected((active + (e.key === "ArrowDown" ? 1 : -1) + entries.length) % Math.max(1, entries.length)); }
      if (e.key === "Enter") { e.preventDefault(); entries[active]?.run(); }
    }} className="mb-3 min-h-12 w-full rounded-xl border border-white/15 bg-black/20 px-3 text-base outline-none focus:border-sun" placeholder="Channels, conversations, settings…" />
    <ul id={listId} role="listbox" aria-label="Destinations" className="max-h-[50dvh] space-y-1 overflow-y-auto">
      {entries.map((entry, index) => <li key={entry.id} id={`${listId}-${entry.id}`} role="option" aria-selected={index === active}>
        <button type="button" tabIndex={-1} onClick={entry.run} onPointerMove={() => setSelected(index)} className={`min-h-11 w-full truncate rounded-lg px-3 text-left text-sm ${index === active ? "bg-sun/15 text-sun" : "text-slate-300 hover:bg-white/5"}`}>{entry.label}</button>
      </li>)}
    </ul>
    {!entries.length && <p role="status" className="py-4 text-sm text-slate-400">No destinations match.</p>}
    {error && <p role="status" className="mt-2 text-xs text-amber-200">Channels couldn&apos;t load. Your conversations and communities are still available.</p>}
    <p className="mt-3 text-xs text-slate-400">↑ ↓ to choose · Enter to open · Escape to close</p>
  </FloatingWindow>;
}
