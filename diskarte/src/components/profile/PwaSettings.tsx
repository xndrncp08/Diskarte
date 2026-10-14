"use client";

import { useState } from "react";
import { usePwa } from "@/components/providers/PwaProvider";
import { Button } from "@/components/ui/Button";

export function PwaSettings() {
  const pwa = usePwa();
  const [note, setNote] = useState("");
  if (!pwa) return null;
  return <section className="mt-8 max-w-md space-y-3">
    <h3 className="text-sm font-semibold">App installation &amp; storage</h3>
    {pwa.installed ? <p className="text-sm text-slate-300">You’re using the installed app.</p> : pwa.canInstall ? <Button variant="secondary" onClick={() => void pwa.install()}>Install Diskarte</Button> : <p className="text-sm text-slate-400">Use your browser’s Install app menu. On iPhone or iPad, open Diskarte in Safari and choose Share → Add to Home Screen.</p>}
    {pwa.updateAvailable && <div role="status"><p className="mb-2 text-sm">A new version is ready. Finish your call before reloading.</p><Button onClick={pwa.update}>Reload to update</Button></div>}
    {pwa.error && <p role="status" className="text-sm text-amber-200">{pwa.error}</p>}
    <Button variant="secondary" onClick={() => void pwa.clearCache().then(() => setNote("Downloaded app files cleared. Your drafts and queued messages are preserved.")).catch(() => setNote("Cache couldn’t be cleared. Try again."))}>Clear downloaded app files</Button>
    {note && <p role="status" className="text-sm text-slate-300">{note}</p>}
    <p className="text-xs text-slate-400">Offline caching stores app files and an offline page. Private conversations and attachments stay out of that cache. Background push notifications require server configuration and are not enabled.</p>
  </section>;
}
