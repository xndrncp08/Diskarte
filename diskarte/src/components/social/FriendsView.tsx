"use client";

import { Check, Menu as MenuIcon, MessageCircle, ShieldOff, UserPlus, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { blockUserAction, openDmAction, removeFriendAction, respondFriendRequestAction, sendFriendRequestAction } from "@/actions/social";
import { useSocial } from "@/components/providers/SocialProvider";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { useShellUI } from "@/components/shell/ShellUI";
import { Button } from "@/components/ui/Button";
import { InputField } from "@/components/ui/Field";
import { useContextMenu } from "@/components/ui/ContextMenu";
import { Menu } from "@/components/ui/Menu";
import type { Server } from "@/lib/servers";
import type { SocialProfile } from "@/lib/social";
import { cn } from "@/lib/utils";
import { HomeSidebar } from "./HomeSidebar";
import { PersonContextMenu } from "./PersonMenu";
import { Glyph } from "@/components/ui/Glyph";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";

type Tab = "all" | "pending" | "blocked" | "add";

function PersonRow({ profile, children }: { profile: SocialProfile | undefined; children: React.ReactNode }) {
  const menu = useContextMenu({ disabled: !profile });
  if (!profile) return null;
  return (
    <li className="flex items-center gap-3 border-t border-white/5 px-2 py-2.5 first:border-t-0" data-testid="friend-row" {...menu.triggerProps}>
      <UserAvatar profile={profile} size={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-white">{profile.display_name}</p>
        <p className="truncate text-xs text-slate-400">
          @{profile.username}
          {(profile.custom_status || profile.custom_status_emoji) && (
            <>
              {" "}
              · <Glyph code={profile.custom_status_emoji} className="size-3" /> {profile.custom_status}
            </>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">{children}</div>
      <PersonContextMenu menu={menu} person={profile} />
    </li>
  );
}

const iconButton = "touch-target relative rounded-full bg-white/5 p-2 text-slate-300 transition-colors hover:bg-white/15 hover:text-white";

export function FriendsView({ servers }: { servers: Server[] }) {
  const { friends, blocked, profiles, reload, reloadConversations } = useSocial();
  const { setNavOpen } = useShellUI();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [pending, startTransition] = useTransition();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | undefined>();

  const accepted = (friends ?? []).filter((f) => f.status === "accepted");
  const requests = (friends ?? []).filter((f) => f.status !== "accepted");
  const incoming = requests.filter((f) => f.status === "incoming").length;

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) return void toast.error(result.error ?? "Something went wrong.");
      if (success) toast.success(success);
      await reload();
    });
  }

  function message(userId: string) {
    startTransition(async () => {
      const result = await openDmAction({ userId });
      if (!result.ok || !result.data) return void toast.error(result.error ?? "Couldn't open the DM.");
      await reloadConversations();
      router.push(`/tambayan/dm/${result.data.conversationId}`);
    });
  }

  function add(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await sendFriendRequestAction({ username });
      if (!result.ok) {
        setError(result.fieldErrors?.username ?? result.error);
        return;
      }
      setError(undefined);
      setUsername("");
      toast.success(result.data?.status === "accepted" ? "You're now friends!" : `Friend request sent to @${username.replace(/^@/, "")}.`);
      await reload();
    });
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "all", label: "All" },
    { id: "pending", label: "Pending", count: incoming },
    { id: "blocked", label: "Blocked" },
    { id: "add", label: "Add Friend" },
  ];

  return (
    <>
      <HomeSidebar servers={servers} />
      <WorkspacePanel id="main" title="Friends">
        <section className="flex min-w-0 flex-1 flex-col md:overflow-hidden">
          <header className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b border-white/5 bg-black/20 px-3 scrollbar-none">
            <button type="button" onClick={() => setNavOpen(true)} aria-label="Open navigation" className="touch-target relative rounded-md p-1.5 text-slate-300 hover:bg-white/10 md:hidden">
              <MenuIcon className="size-5" aria-hidden />
            </button>
            <Users className="size-5 shrink-0 text-slate-400" aria-hidden />
            <h1 className="mr-2 font-bold text-white">Friends</h1>
            <div role="tablist" aria-label="Friends" className="flex gap-1">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-semibold transition-colors pointer-coarse:py-2",
                    t.id === "add" ? (tab === t.id ? "bg-transparent text-emerald-300" : "bg-emerald-700 text-white hover:bg-emerald-800") : tab === t.id ? "bg-white/15 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
                  )}
                >
                  {t.label}
                  {t.count ? <span className="rounded-full bg-red-600 px-1.5 text-[10px] text-white">{t.count}</span> : null}
                </button>
              ))}
            </div>
          </header>

          <div className="scrollbar-thin flex-1 overflow-y-auto p-4" role="tabpanel">
            {tab === "add" && (
              <form onSubmit={add} className="max-w-xl space-y-2">
                <h2 className="font-bold text-white">Add a friend</h2>
                <p className="text-sm text-slate-400">Type their @username. Not case-sensitive.</p>
                <div className="flex gap-2">
                  <InputField
                    label="Username"
                    wrapperClassName="flex-1 [&>label]:sr-only"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="@juan.dela.cruz"
                    autoComplete="off"
                    autoCapitalize="none"
                    data-autofocus
                    error={error}
                  />
                  <Button type="submit" loading={pending} disabled={!username.trim()}>
                    <UserPlus className="size-4" aria-hidden /> Send
                  </Button>
                </div>
              </form>
            )}

            {friends === null && tab !== "add" && <div className="h-24 animate-pulse rounded-xl bg-white/5" />}

            {friends && tab === "all" && (
              <section aria-label="All friends">
                <h2 className="mb-2 font-silk text-[11px] uppercase tracking-wider text-slate-400">All friends — {accepted.length}</h2>
                {accepted.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">No friends yet. Press &quot;Add Friend&quot; to get started!</p>
                ) : (
                  <ul>
                    {accepted.map((f) => (
                      <PersonRow key={f.userId} profile={profiles.get(f.userId)}>
                        <button type="button" aria-label={`Message ${profiles.get(f.userId)?.display_name}`} onClick={() => message(f.userId)} className={iconButton} disabled={pending}>
                          <MessageCircle className="size-4" aria-hidden />
                        </button>
                        <Menu
                          label="Friend options"
                          align="end"
                          items={[
                            { label: "Unfriend", onSelect: () => run(() => removeFriendAction({ userId: f.userId }), "Removed friend.") },
                            { label: "Block", danger: true, onSelect: () => run(() => blockUserAction({ userId: f.userId, block: true }), "Blocked.") },
                          ]}
                          trigger={({ toggle, open, id }) => (
                            <button type="button" onClick={toggle} aria-expanded={open} aria-controls={id} aria-haspopup="menu" aria-label="More options" className={iconButton}>
                              <span className="block size-4 text-center leading-4" aria-hidden>
                                ⋮
                              </span>
                            </button>
                          )}
                        />
                      </PersonRow>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {friends && tab === "pending" && (
              <section aria-label="Pending requests">
                <h2 className="mb-2 font-silk text-[11px] uppercase tracking-wider text-slate-400">Pending — {requests.length}</h2>
                {requests.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">No pending friend requests.</p>
                ) : (
                  <ul>
                    {requests.map((f) => (
                      <PersonRow key={f.userId} profile={profiles.get(f.userId)}>
                        <span className="mr-1 text-xs text-slate-500">{f.status === "incoming" ? "Incoming" : "Outgoing"}</span>
                        {f.status === "incoming" && (
                          <button type="button" aria-label="Accept" onClick={() => run(() => respondFriendRequestAction({ userId: f.userId, accept: true }), "You're now friends!")} className={cn(iconButton, "hover:text-emerald-300")} disabled={pending}>
                            <Check className="size-4" aria-hidden />
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label={f.status === "incoming" ? "Decline" : "Cancel request"}
                          onClick={() => run(() => (f.status === "incoming" ? respondFriendRequestAction({ userId: f.userId, accept: false }) : removeFriendAction({ userId: f.userId })))}
                          className={cn(iconButton, "hover:text-red-300")}
                          disabled={pending}
                        >
                          <X className="size-4" aria-hidden />
                        </button>
                      </PersonRow>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {friends && tab === "blocked" && (
              <section aria-label="Blocked users">
                <h2 className="mb-2 font-silk text-[11px] uppercase tracking-wider text-slate-400">Blocked — {blocked.length}</h2>
                {blocked.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">You haven&apos;t blocked anyone.</p>
                ) : (
                  <ul>
                    {blocked.map((id) => (
                      <PersonRow key={id} profile={profiles.get(id)}>
                        <button type="button" aria-label="Unblock" onClick={() => run(() => blockUserAction({ userId: id, block: false }), "Unblocked.")} className={iconButton} disabled={pending}>
                          <ShieldOff className="size-4" aria-hidden />
                        </button>
                      </PersonRow>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>
        </section>
      </WorkspacePanel>
    </>
  );
}
