"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useMe } from "@/components/providers/MeProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { useServer } from "@/components/providers/ServerProvider";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { subscribeDbChanges } from "@/lib/realtime";

interface Warning {
  id: string;
  reason: string;
  created_at: string;
}

/** Warnings a moderator gave me in this server that I haven't dismissed yet (they arrive live too). */
export function WarningNotice() {
  const supabase = useSupabase();
  const { me } = useMe();
  const { server } = useServer();
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    const load = () =>
      void supabase
        .from("member_warnings")
        .select("id, reason, created_at")
        .eq("server_id", server.id)
        .eq("user_id", me.id)
        .is("acknowledged_at", null)
        .order("created_at")
        .then(({ data }) => live && data && setWarnings(data));
    load();
    const stop = subscribeDbChanges(supabase, `account:${me.id}:warnings`, (channel) =>
      channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "member_warnings", filter: `user_id=eq.${me.id}` }, load),
    );
    return () => {
      live = false;
      stop();
    };
  }, [supabase, server.id, me.id]);

  async function dismiss() {
    setBusy(true);
    await supabase.rpc("acknowledge_warnings", { p_server: server.id });
    setBusy(false);
    setWarnings([]);
  }

  return (
    <Modal open={warnings.length > 0} onClose={() => void dismiss()} title={`A warning from ${server.name}`} className="max-w-md">
      <div className="flex gap-3">
        <TriangleAlert className="size-6 shrink-0 text-amber-300" aria-hidden />
        <div className="min-w-0 space-y-2 text-sm text-slate-200">
          <p className="text-slate-400">The moderators sent you {warnings.length === 1 ? "a warning" : `${warnings.length} warnings`}. Repeated issues can lead to a timeout, kick or ban.</p>
          <ul className="space-y-1.5">
            {warnings.map((w) => (
              <li key={w.id} className="whitespace-pre-wrap break-words rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2">
                {w.reason}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={() => void dismiss()} loading={busy} data-autofocus>
          Got it
        </Button>
      </div>
    </Modal>
  );
}
