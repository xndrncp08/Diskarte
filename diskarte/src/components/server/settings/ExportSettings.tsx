"use client";
import { useState } from "react";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { useServer } from "@/components/providers/ServerProvider";
import { Button } from "@/components/ui/Button";
export function ExportSettings() {
  const supabase = useSupabase(), { server } = useServer();
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState("");
  return <section className="mt-6 space-y-3 rounded-xl border border-white/10 p-4"><h3 className="font-semibold">Export community settings</h3><p className="text-sm text-slate-400">Downloads community settings, channel definitions, roles and emoji. Messages, member data and invitation secrets are excluded. Keep the file private; it includes private channel names.</p><Button variant="secondary" loading={busy} onClick={async () => {
    setBusy(true); setProblem("");
    try {
      const { data, error } = await supabase.rpc("export_server_settings", { p_server: server.id });
      if (error || !data) throw error;
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `diskarte-settings-${server.id}.json`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setProblem("Couldn’t export settings. Check your connection and owner access, then retry."); }
    finally { setBusy(false); }
  }}>Download settings</Button>{problem && <p role="alert" className="text-sm text-amber-200">{problem}</p>}</section>;
}
