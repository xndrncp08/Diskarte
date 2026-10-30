"use client";

import {
  Check,
  Menu as MenuIcon,
  MessageCircle,
  Search,
  ShieldOff,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import {
  blockUserAction,
  openDmAction,
  removeFriendAction,
  respondFriendRequestAction,
  sendFriendRequestAction,
} from "@/actions/social";
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

function PersonRow({
  profile,
  children,
}: {
  profile: SocialProfile | undefined;
  children: React.ReactNode;
}) {
  const menu = useContextMenu({ disabled: !profile });
  if (!profile) return null;
  return (
    <li
      className="friend-row flex items-center gap-3 border-t border-white/5 px-2 py-2.5 first:border-t-0"
      data-testid="friend-row"
      {...menu.triggerProps}
    >
      <UserAvatar profile={profile} size={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-white">
          {profile.display_name}
        </p>
        <p className="truncate text-xs text-slate-400">
          @{profile.username}
          {(profile.custom_status || profile.custom_status_emoji) && (
            <>
              {" "}
              · <Glyph
                code={profile.custom_status_emoji}
                className="size-3"
              />{" "}
              {profile.custom_status}
            </>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">{children}</div>
      <PersonContextMenu menu={menu} person={profile} />
    </li>
  );
}

const iconButton =
  "touch-target relative rounded-full bg-white/5 p-2 text-slate-300 transition-colors hover:bg-white/15 hover:text-white";

export function FriendsView({ servers }: { servers: Server[] }) {
  const { friends, blocked, profiles, reload, reloadConversations } =
    useSocial();
  const { setNavOpen } = useShellUI();
  const router = useRouter();
  const id = useId();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [pending, startTransition] = useTransition();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | undefined>();

  const accepted = (friends ?? []).filter((f) => f.status === "accepted");
  const matchingFriends = accepted.filter((friend) => {
    const profile = profiles.get(friend.userId);
    return (
      !query.trim() ||
      `${profile?.display_name ?? ""} ${profile?.username ?? ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
    );
  });
  const requests = (friends ?? []).filter((f) => f.status !== "accepted");
  const incoming = requests.filter((f) => f.status === "incoming").length;

  function run(
    action: () => Promise<{ ok: boolean; error?: string }>,
    success?: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok)
        return void toast.error(result.error ?? "Something went wrong.");
      if (success) toast.success(success);
      await reload();
    });
  }

  function message(userId: string) {
    startTransition(async () => {
      const result = await openDmAction({ userId });
      if (!result.ok || !result.data)
        return void toast.error(result.error ?? "Couldn't open the DM.");
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
      toast.success(
        result.data?.status === "accepted"
          ? "You're now friends!"
          : `Friend request sent to @${username.replace(/^@/, "")}.`,
      );
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
          <header className="page-header">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              aria-label="Open navigation"
              className="touch-target relative rounded-md p-1.5 text-slate-300 hover:bg-white/10 md:hidden"
            >
              <MenuIcon className="size-5" aria-hidden />
            </button>
            <Users className="size-5 shrink-0 text-slate-400" aria-hidden />
            <h1 className="mr-2 font-bold text-white">Friends</h1>
          </header>
          <div
            role="tablist"
            aria-label="Friends"
            className="social-tabs scrollbar-none flex gap-1 overflow-x-auto"
            onKeyDown={(event) => {
              const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
              const next = step
                ? (tabs.findIndex((item) => item.id === tab) +
                    step +
                    tabs.length) %
                  tabs.length
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? tabs.length - 1
                    : null;
              if (next === null) return;
              event.preventDefault();
              setTab(tabs[next].id);
              document.getElementById(`${id}-${tabs[next].id}`)?.focus();
            }}
          >
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`${id}-${t.id}`}
                aria-controls={`${id}-panel`}
                tabIndex={tab === t.id ? 0 : -1}
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-semibold transition-colors pointer-coarse:py-2",
                  t.id === "add"
                    ? tab === t.id
                      ? "bg-transparent text-sun"
                      : "bg-sun text-[#0b1020] hover:bg-sun/90"
                    : tab === t.id
                      ? "bg-white/15 text-white"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
                )}
              >
                {t.label}
                {t.count ? (
                  <span className="rounded-full bg-red-600 px-1.5 text-[10px] text-white">
                    {t.count}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <div
            id={`${id}-panel`}
            aria-labelledby={`${id}-${tab}`}
            className="social-content scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4"
            role="tabpanel"
          >
            {tab === "add" && (
              <form onSubmit={add} className="max-w-xl space-y-2">
                <h2 className="font-bold text-white">Add a friend</h2>
                <p className="text-sm text-slate-400">
                  Type their @username. Not case-sensitive.
                </p>
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
                  <Button
                    type="submit"
                    loading={pending}
                    disabled={!username.trim()}
                  >
                    <UserPlus className="size-4" aria-hidden /> Send
                  </Button>
                </div>
              </form>
            )}

            {friends === null && tab !== "add" && (
              <div className="h-24 animate-pulse rounded-xl bg-white/5" />
            )}

            {friends && tab === "all" && (
              <section aria-label="All friends">
                <label className="social-search mb-4 flex items-center gap-2">
                  <Search className="size-4 text-slate-400" aria-hidden />
                  <span className="sr-only">Search friends</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Find your people"
                    className="min-h-11 min-w-0 flex-1 bg-transparent text-base outline-none"
                  />
                </label>
                <h2 className="mb-2 font-silk text-[11px] uppercase tracking-wider text-slate-400">
                  All friends — {accepted.length}
                </h2>
                {accepted.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">
                    No friends yet. Press &quot;Add Friend&quot; to get started!
                  </p>
                ) : (
                  <ul>
                    {matchingFriends.length === 0 && (
                      <li role="status" className="py-6 text-sm text-slate-400">
                        No friends match your search.
                      </li>
                    )}
                    {matchingFriends.map((f) => (
                      <PersonRow
                        key={f.userId}
                        profile={profiles.get(f.userId)}
                      >
                        <button
                          type="button"
                          aria-label={`Message ${profiles.get(f.userId)?.display_name}`}
                          onClick={() => message(f.userId)}
                          className={iconButton}
                          disabled={pending}
                        >
                          <MessageCircle className="size-4" aria-hidden />
                        </button>
                        <Menu
                          label="Friend options"
                          align="end"
                          items={[
                            {
                              label: "Unfriend",
                              onSelect: () =>
                                run(
                                  () =>
                                    removeFriendAction({ userId: f.userId }),
                                  "Removed friend.",
                                ),
                            },
                            {
                              label: "Block",
                              danger: true,
                              onSelect: () =>
                                run(
                                  () =>
                                    blockUserAction({
                                      userId: f.userId,
                                      block: true,
                                    }),
                                  "Blocked.",
                                ),
                            },
                          ]}
                          trigger={({ toggle, open, id }) => (
                            <button
                              type="button"
                              onClick={toggle}
                              aria-expanded={open}
                              aria-controls={id}
                              aria-haspopup="menu"
                              aria-label="More options"
                              className={iconButton}
                            >
                              <span
                                className="block size-4 text-center leading-4"
                                aria-hidden
                              >
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
                <h2 className="mb-2 font-silk text-[11px] uppercase tracking-wider text-slate-400">
                  Pending — {requests.length}
                </h2>
                {requests.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">
                    No pending friend requests.
                  </p>
                ) : (
                  <ul>
                    {requests.map((f) => (
                      <PersonRow
                        key={f.userId}
                        profile={profiles.get(f.userId)}
                      >
                        <span className="mr-1 text-xs text-slate-500">
                          {f.status === "incoming" ? "Incoming" : "Outgoing"}
                        </span>
                        {f.status === "incoming" && (
                          <button
                            type="button"
                            aria-label="Accept"
                            onClick={() =>
                              run(
                                () =>
                                  respondFriendRequestAction({
                                    userId: f.userId,
                                    accept: true,
                                  }),
                                "You're now friends!",
                              )
                            }
                            className={cn(iconButton, "hover:text-emerald-300")}
                            disabled={pending}
                          >
                            <Check className="size-4" aria-hidden />
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label={
                            f.status === "incoming"
                              ? "Decline"
                              : "Cancel request"
                          }
                          onClick={() =>
                            run(() =>
                              f.status === "incoming"
                                ? respondFriendRequestAction({
                                    userId: f.userId,
                                    accept: false,
                                  })
                                : removeFriendAction({ userId: f.userId }),
                            )
                          }
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
                <h2 className="mb-2 font-silk text-[11px] uppercase tracking-wider text-slate-400">
                  Blocked — {blocked.length}
                </h2>
                {blocked.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">
                    You haven&apos;t blocked anyone.
                  </p>
                ) : (
                  <ul>
                    {blocked.map((id) => (
                      <PersonRow key={id} profile={profiles.get(id)}>
                        <button
                          type="button"
                          aria-label="Unblock"
                          onClick={() =>
                            run(
                              () =>
                                blockUserAction({ userId: id, block: false }),
                              "Unblocked.",
                            )
                          }
                          className={iconButton}
                          disabled={pending}
                        >
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
