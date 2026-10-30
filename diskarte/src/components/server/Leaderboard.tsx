"use client";

import { Trophy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useMe } from "@/components/providers/MeProvider";
import { useOptionalSupabase } from "@/components/providers/RuntimeConfig";
import { useServer } from "@/components/providers/ServerProvider";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { Modal } from "@/components/ui/Modal";
import { levelFor, xpForLevel } from "@/lib/community";
import { cn } from "@/lib/utils";

type Row = { user_id: string; xp: number };

/** Sidebar row + dialog: the Tambayan's top members by XP, when an admin has levels on. */
export function LeaderboardButton() {
  const supabase = useOptionalSupabase();
  const { server, members } = useServer();
  const { me } = useMe();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [mine, setMine] = useState<Row | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [top, self] = await Promise.all([
      supabase.from("member_xp").select("user_id, xp").eq("server_id", server.id).order("xp", { ascending: false }).limit(50),
      supabase.from("member_xp").select("user_id, xp").eq("server_id", server.id).eq("user_id", me.id).maybeSingle(),
    ]);
    setRows(top.data ?? []);
    setMine(self.data ?? null);
  }, [supabase, server.id, me.id]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the network when opened
    void load();
  }, [open, load]);

  if (!server.levels_enabled) return null;
  const byId = new Map(members.map((m) => [m.user_id, m]));
  const listed = (rows ?? []).filter((r) => byId.has(r.user_id));
  const myLevel = levelFor(mine?.xp ?? 0);
  const toNext = xpForLevel(myLevel + 1) - (mine?.xp ?? 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/5 hover:text-white pointer-coarse:min-h-11"
        data-testid="leaderboard-button"
      >
        <Trophy className="size-4" aria-hidden />
        <span className="flex-1 text-left">Leaderboard</span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Leaderboard" description="15 XP for a message, at most once a minute." className="max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto">
        <p className="mb-3 rounded-lg bg-sun/10 px-3 py-2 text-sm text-sun" data-testid="my-level">
          You&apos;re level {myLevel} · {mine?.xp ?? 0} XP · {toNext} XP to level {myLevel + 1}
        </p>
        {rows === null ? (
          <div className="h-24 animate-pulse rounded-xl bg-white/5" />
        ) : listed.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">No XP yet. Start a conversation!</p>
        ) : (
          <ol aria-label="Top members">
            {listed.map((r, i) => {
              const member = byId.get(r.user_id)!;
              return (
                <li key={r.user_id} className={cn("flex items-center gap-3 border-t border-white/5 py-2 first:border-t-0", r.user_id === me.id && "rounded-lg bg-white/5 px-2")}>
                  <span className={cn("w-6 text-right font-silk text-xs tabular-nums", i < 3 ? "text-sun" : "text-slate-500")}>{i + 1}</span>
                  <UserAvatar profile={member.profile} size={32} />
                  <span className="min-w-0 flex-1 truncate font-semibold text-white">{member.nickname ?? member.profile.display_name}</span>
                  <span className="text-right text-xs text-slate-400">
                    <span className="block font-semibold text-slate-200">Level {levelFor(r.xp)}</span>
                    {r.xp} XP
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </Modal>
    </>
  );
}

/** "Level N" on a member's profile card when levels are on. */
export function MemberLevel({ userId }: { userId: string }) {
  const supabase = useOptionalSupabase();
  const { server } = useServer();
  const [xp, setXp] = useState<number | null>(null);
  const enabled = !!server.levels_enabled;
  useEffect(() => {
    if (!supabase || !enabled) return;
    let live = true;
    void supabase.from("member_xp").select("xp").eq("server_id", server.id).eq("user_id", userId).maybeSingle().then(({ data }) => {
      if (live) setXp(data?.xp ?? 0);
    });
    return () => {
      live = false;
    };
  }, [supabase, enabled, server.id, userId]);
  if (!enabled || xp === null) return null;
  return (
    <p className="mt-2 inline-flex items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 text-xs font-semibold text-slate-200" data-testid="member-level">
      <Trophy className="size-3 text-sun" aria-hidden /> Level {levelFor(xp)} · {xp} XP
    </p>
  );
}
