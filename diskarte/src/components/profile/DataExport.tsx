"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { Button } from "@/components/ui/Button";

/** Discord's "Request all of my data": everything this account wrote or set, as one JSON file. */
export function DataExport({ username }: { username: string }) {
  const supabase = useSupabase();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    const { data, error } = await supabase.rpc("export_my_data");
    setBusy(false);
    if (error || !data) return void toast.error("Couldn't prepare your data. Try again in a moment.");
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `diskarte-data-${username}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="min-w-0 flex-1 text-sm text-slate-400">Your profile, servers, messages, DMs, friends, notes, settings and more, as a JSON file.</p>
      <Button variant="secondary" onClick={() => void download()} loading={busy}>
        <Download className="size-4" aria-hidden /> Download my data
      </Button>
    </div>
  );
}
