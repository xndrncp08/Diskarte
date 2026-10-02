"use client";

import { Loader2, UserCheck } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { unbanMemberAction } from "@/actions/moderation";
import { Timestamp } from "@/components/chat/Timestamp";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { useServer } from "@/components/providers/ServerProvider";
import { Button } from "@/components/ui/Button";
import { useProfileNames } from "@/hooks/useProfileNames";
import type { Tables } from "@/lib/supabase/database.types";

type BanRow = Tables<"server_bans">;

/** Banned accounts, who banned them and why; moderators can lift a ban. */
export function BansPanel() {
  const supabase = useSupabase();
  const { server } = useServer();
  const [bans, setBans] = useState<BanRow[] | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const { data } = await supabase.from("server_bans").select("*").eq("server_id", server.id).order("created_at", { ascending: false });
    setBans(data ?? []);
  }, [supabase, server.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
  }, [load]);

  const name = useProfileNames((bans ?? []).flatMap((b) => [b.user_id, b.banned_by]));

  function unban(userId: string) {
    startTransition(async () => {
      const result = await unbanMemberAction({ serverId: server.id, userId });
      if (!result.ok) {
        toast.error(result.error ?? "Couldn't unban.");
        return;
      }
      toast.success(`Unbanned ${name(userId)}. They'll need an invite to rejoin.`);
      setBans((prev) => prev?.filter((b) => b.user_id !== userId) ?? null);
    });
  }

  if (!bans) {
    return (
      <div className="flex justify-center py-6 text-slate-500">
        <Loader2 className="size-5 animate-spin" aria-label="Loading bans" />
      </div>
    );
  }
  if (bans.length === 0) {
    return <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">No bans. All peaceful here. ✌️</p>;
  }
  return (
    <ul className="space-y-2" data-testid="bans-list">
      {bans.map((b) => (
        <li key={b.user_id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-white">{name(b.user_id)}</p>
            <p className="truncate text-xs text-slate-400">
              Ni-ban ni {name(b.banned_by)} · <Timestamp iso={b.created_at} />
              {b.reason && <> · “{b.reason}”</>}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => unban(b.user_id)} disabled={pending}>
            <UserCheck className="size-4" aria-hidden /> Unban
          </Button>
        </li>
      ))}
    </ul>
  );
}
