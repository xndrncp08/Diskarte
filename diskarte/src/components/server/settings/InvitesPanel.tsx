"use client";

import { Loader2, X } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { revokeInviteAction } from "@/actions/servers";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { useServer } from "@/components/providers/ServerProvider";
import { Button } from "@/components/ui/Button";
import { useProfileNames } from "@/hooks/useProfileNames";
import { inviteExpiry } from "@/lib/servers";
import type { Tables } from "@/lib/supabase/database.types";

type InviteRow = Tables<"server_invites">;

/** Discord's Invites tab: every limited invite link, who made it, uses and expiry; moderators revoke. */
export function InvitesPanel() {
  const supabase = useSupabase();
  const { server } = useServer();
  const [invites, setInvites] = useState<InviteRow[] | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const { data } = await supabase.from("server_invites").select("*").eq("server_id", server.id).order("created_at", { ascending: false });
    setInvites(data ?? []);
  }, [supabase, server.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
  }, [load]);

  const name = useProfileNames((invites ?? []).map((i) => i.created_by));

  function revoke(code: string) {
    startTransition(async () => {
      const result = await revokeInviteAction({ code });
      if (!result.ok) return void toast.error(result.error ?? "Couldn't revoke.");
      setInvites((prev) => prev?.filter((i) => i.code !== code) ?? null);
    });
  }

  if (!invites) {
    return (
      <div className="flex justify-center py-6 text-slate-500">
        <Loader2 className="size-5 animate-spin" aria-label="Loading invites" />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">
        The server&apos;s permanent link (<span className="font-mono">{server.invite_code}</span>) is reset from the Invite dialog. Links below expire or run out of uses.
      </p>
      {invites.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">No limited invites yet.</p>
      ) : (
        <ul className="space-y-2" data-testid="invites-list">
          {invites.map((i) => (
            <li key={i.code} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm font-semibold text-white">{i.code}</p>
                <p className="truncate text-xs text-slate-400">
                  by {name(i.created_by)} · {i.uses}
                  {i.max_uses ? `/${i.max_uses}` : ""} uses · {inviteExpiry(i.expires_at)}
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => revoke(i.code)} disabled={pending} aria-label={`Revoke invite ${i.code}`}>
                <X className="size-4" aria-hidden /> Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
