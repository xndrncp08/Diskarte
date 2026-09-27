"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createGroupDmAction } from "@/actions/social";
import { useSocial } from "@/components/providers/SocialProvider";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { DrawerPanel } from "@/components/shell/AppShell";
import { ServerIcon } from "@/components/shell/ServerIcon";
import { useShellUI } from "@/components/shell/ShellUI";
import { UserPanel } from "@/components/shell/UserPanel";
import { Button } from "@/components/ui/Button";
import { InputField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { CallDock } from "@/components/voice/CallDock";
import type { Server } from "@/lib/servers";
import { conversationTitle, isUnread, type ConversationSummary } from "@/lib/social";
import { cn } from "@/lib/utils";

function ConversationAvatar({ conversation, size = 32 }: { conversation: ConversationSummary; size?: number }) {
  const [first, second] = conversation.others;
  if (conversation.kind === "direct" || !second) {
    return first ? <UserAvatar profile={first} size={size} /> : <span className="block rounded-full bg-white/10" style={{ width: size, height: size }} />;
  }
  return (
    <span className="relative block shrink-0" style={{ width: size, height: size }} aria-hidden>
      <span className="absolute left-0 top-0">
        <UserAvatar profile={first} size={size * 0.7} />
      </span>
      <span className="absolute bottom-0 right-0 rounded-full ring-2 ring-midnight">
        <UserAvatar profile={second} size={size * 0.7} />
      </span>
    </span>
  );
}

export { ConversationAvatar };

/** Home column: Friends, direct messages and group DMs, then your tambayans. */
export function HomeSidebar({ servers = [] }: { servers?: Server[] }) {
  const { conversations, friends, profiles } = useSocial();
  const { setNavOpen } = useShellUI();
  const pathname = usePathname();
  const [groupOpen, setGroupOpen] = useState(false);
  const incoming = friends?.filter((f) => f.status === "incoming").length ?? 0;
  const accepted = (friends ?? []).filter((f) => f.status === "accepted");

  return (
    <DrawerPanel>
      <aside aria-label="Home" className="glass flex h-full w-60 flex-col border-y-0 border-l-0">
        <div className="flex h-12 items-center border-b border-white/5 px-4 font-bold text-white">Home</div>
        <nav aria-label="Direct messages" className="scrollbar-thin flex-1 overflow-y-auto px-2 py-3">
          <Link
            href="/tambayan/friends"
            onClick={() => setNavOpen(false)}
            aria-current={pathname === "/tambayan/friends" ? "page" : undefined}
            className={cn(
              "mb-3 flex items-center gap-2.5 rounded-md px-2 py-2 text-sm font-semibold transition-colors",
              pathname === "/tambayan/friends" ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white",
            )}
          >
            <Users className="size-5" aria-hidden />
            Friends
            {incoming > 0 && (
              <span className="ml-auto rounded-full bg-red-500 px-1.5 font-silk text-[10px] text-white" aria-label={`${incoming} pending requests`}>
                {incoming}
              </span>
            )}
          </Link>

          <div className="mb-1 flex items-center justify-between px-2">
            <p className="font-silk text-[11px] uppercase tracking-wider text-slate-400">Direct messages</p>
            <button
              type="button"
              aria-label="New group DM"
              onClick={() => setGroupOpen(true)}
              className="touch-target relative rounded p-0.5 text-slate-400 hover:text-white"
            >
              <Plus className="size-4" aria-hidden />
            </button>
          </div>
          <ul className="space-y-0.5" data-testid="dm-list">
            {conversations === null ? (
              [0, 1, 2].map((i) => <li key={i} className="mx-2 h-9 animate-pulse rounded-md bg-white/5" />)
            ) : conversations.length === 0 ? (
              <li className="px-2 py-1 text-xs text-slate-500">Wala pang DMs. Mag-add ng friends!</li>
            ) : (
              conversations.map((c) => {
                const href = `/tambayan/dm/${c.id}`;
                const active = pathname === href;
                const unread = !active && isUnread(c);
                return (
                  <li key={c.id}>
                    <Link
                      href={href}
                      onClick={() => setNavOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors pointer-coarse:py-2.5",
                        active ? "bg-white/10 text-white" : unread ? "font-semibold text-white hover:bg-white/5" : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
                      )}
                    >
                      <ConversationAvatar conversation={c} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{conversationTitle(c)}</span>
                        {c.kind === "group" && <span className="block text-[11px] font-normal text-slate-500">{c.others.length + 1} members</span>}
                      </span>
                      {unread && <span className="size-2 shrink-0 rounded-full bg-sun" aria-label="Unread" />}
                    </Link>
                  </li>
                );
              })
            )}
          </ul>

          {servers.length > 0 && (
            <>
              <p className="mb-1 mt-5 px-2 font-silk text-[11px] uppercase tracking-wider text-slate-400">Mga tambayan mo</p>
              <ul className="space-y-0.5">
                {servers.map((s) => (
                  <li key={s.id}>
                    <Link href={`/tambayan/${s.id}`} onClick={() => setNavOpen(false)} className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white">
                      <ServerIcon server={s} size={28} />
                      <span className="truncate">{s.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </nav>
        <CallDock />
        <UserPanel />
      </aside>
      <Modal open={groupOpen} onClose={() => setGroupOpen(false)} title="Bagong group DM">
        <GroupDmForm friendIds={accepted.map((f) => f.userId)} profiles={profiles} onDone={() => setGroupOpen(false)} />
      </Modal>
    </DrawerPanel>
  );
}

function GroupDmForm({ friendIds, profiles, onDone }: { friendIds: string[]; profiles: ReturnType<typeof useSocial>["profiles"]; onDone: () => void }) {
  const router = useRouter();
  const { reloadConversations } = useSocial();
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  if (friendIds.length < 2) {
    return <p className="text-sm text-slate-400">Kailangan mo ng hindi bababa sa 2 friends para gumawa ng group DM.</p>;
  }

  function create() {
    startTransition(async () => {
      const result = await createGroupDmAction({ userIds: picked, name });
      if (!result.ok || !result.data) return void toast.error(result.error ?? "Hindi nagawa.");
      await reloadConversations();
      onDone();
      router.push(`/tambayan/dm/${result.data.conversationId}`);
    });
  }

  return (
    <div className="space-y-4">
      <InputField label="Pangalan (optional)" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} placeholder="Squad Goals" />
      <fieldset>
        <legend className="mb-1.5 font-silk text-[11px] uppercase tracking-wider text-slate-300">Friends ({picked.length}/9)</legend>
        <ul className="scrollbar-thin max-h-60 space-y-1 overflow-y-auto">
          {friendIds.map((id) => {
            const p = profiles.get(id);
            if (!p) return null;
            const checked = picked.includes(id);
            return (
              <li key={id}>
                <label className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/5", checked && "bg-sun/10")}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && picked.length >= 9}
                    onChange={() => setPicked((prev) => (checked ? prev.filter((x) => x !== id) : [...prev, id]))}
                    className="size-4 accent-[#FFB800]"
                  />
                  <UserAvatar profile={p} size={28} />
                  <span className="truncate text-sm text-slate-200">{p.display_name}</span>
                  <span className="truncate text-xs text-slate-500">@{p.username}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
      <Button onClick={create} loading={pending} disabled={picked.length < 2} className="w-full">
        Gumawa ng group DM
      </Button>
    </div>
  );
}
