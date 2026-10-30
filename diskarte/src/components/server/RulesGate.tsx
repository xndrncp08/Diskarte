"use client";

import { ScrollText } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useMe } from "@/components/providers/MeProvider";
import { useOptionalSupabase } from "@/components/providers/RuntimeConfig";
import { useServer } from "@/components/providers/ServerProvider";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { hasRole } from "@/lib/servers";

/**
 * Shows `children` (the composer) once I've accepted this server's current rules; until then a
 * card that opens them. Moderators and up skip it, like the database does.
 */
export function RulesGate({ children }: { children: ReactNode }) {
  const supabase = useOptionalSupabase();
  const { server, myRole } = useServer();
  const { me } = useMe();
  const needed = !!server.rules && !hasRole(myRole, "moderator");
  const [acceptedAt, setAcceptedAt] = useState<string | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!needed || !supabase) return;
    let live = true;
    void supabase.from("rules_acceptances").select("accepted_at").eq("server_id", server.id).eq("user_id", me.id).maybeSingle().then(({ data }) => {
      if (live) setAcceptedAt(data?.accepted_at ?? null);
    });
    return () => {
      live = false;
    };
  }, [needed, supabase, server.id, me.id]);

  const accepted = acceptedAt && server.rules_updated_at && new Date(acceptedAt).getTime() >= new Date(server.rules_updated_at).getTime();
  // Until the check loads, show the composer: the database still refuses a send if rules are pending.
  if (!needed || acceptedAt === undefined || accepted) return <>{children}</>;

  async function accept() {
    setBusy(true);
    const { error } = await supabase!.rpc("accept_server_rules", { p_server: server.id });
    setBusy(false);
    if (error) return void toast.error("Couldn't save that. Try again.");
    setAcceptedAt(new Date().toISOString());
    setOpen(false);
  }

  return (
    <div className="px-4 pb-safe">
      <div className="glass mb-6 flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-300" data-testid="rules-gate">
        <ScrollText className="size-5 shrink-0 text-sun" aria-hidden />
        <span className="min-w-0 flex-1">Read and accept {server.name}&apos;s rules to start chatting.</span>
        <Button size="sm" onClick={() => setOpen(true)}>
          Read the rules
        </Button>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={`${server.name} rules`} className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto">
        <p className="whitespace-pre-wrap text-slate-200">{server.rules}</p>
        <Button className="mt-5 w-full" loading={busy} onClick={() => void accept()}>
          I agree
        </Button>
      </Modal>
    </div>
  );
}
