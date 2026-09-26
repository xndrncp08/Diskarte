"use client";

import { Check, Copy, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { regenerateInviteAction } from "@/actions/servers";
import { useServer } from "@/components/providers/ServerProvider";
import { useRuntimeConfig } from "@/components/providers/RuntimeConfig";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { inviteUrl } from "@/lib/servers";

export function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { server, myRole } = useServer();
  const { siteUrl } = useRuntimeConfig();
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const current = code ?? server.invite_code;
  const url = inviteUrl(siteUrl, current);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Hindi ma-copy — i-select na lang ang link.");
    }
  }

  function regenerate() {
    startTransition(async () => {
      const result = await regenerateInviteAction({ serverId: server.id });
      if (result.ok && result.data) {
        setCode(result.data.code);
        toast.success("Bagong invite link! Hindi na gagana ang luma.");
      } else toast.error(result.error ?? "Hindi na-reset.");
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={`I-invite ang barkada sa ${server.name}`} description="Ibahagi ang link na 'to para makasali sila.">
      <label htmlFor="invite-url" className="mb-1.5 block font-silk text-[11px] uppercase tracking-wider text-slate-300">
        Invite link
      </label>
      <div className="flex gap-2">
        <input id="invite-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="h-10 flex-1 rounded-lg border border-white/10 bg-black/50 px-3 font-mono text-sm text-slate-100" data-testid="invite-url" />
        <Button onClick={copy} aria-label="Copy invite link">
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Code: <span className="font-mono text-slate-300">{current}</span>
      </p>
      {myRole === "admin" && (
        <Button variant="ghost" size="sm" className="mt-4" onClick={regenerate} loading={pending}>
          <RefreshCw className="size-4" aria-hidden /> Reset invite link
        </Button>
      )}
    </Modal>
  );
}
