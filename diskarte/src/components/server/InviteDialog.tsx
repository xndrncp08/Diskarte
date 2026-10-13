"use client";

import { Check, Copy, RefreshCw, Send, Share2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { regenerateInviteAction } from "@/actions/servers";
import { openDmAction, sendDirectMessageAction } from "@/actions/social";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { useOptionalSocial } from "@/components/providers/SocialProvider";
import { useServer } from "@/components/providers/ServerProvider";
import { useRuntimeConfig } from "@/components/providers/RuntimeConfig";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { inviteUrl } from "@/lib/servers";

export function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { server, myRole, members } = useServer();
  const social = useOptionalSocial();
  const { siteUrl } = useRuntimeConfig();
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const current = code ?? server.invite_code;
  const url = inviteUrl(siteUrl, current);
  // Friends not in the server yet first; "invited" covers this dialog session.
  const [invited, setInvited] = useState<ReadonlySet<string>>(() => new Set());
  const [sending, setSending] = useState<string | null>(null);
  const joined = new Set(members.map((m) => m.user_id));
  const friends = (social?.friends ?? [])
    .filter((f) => f.status === "accepted")
    .flatMap((f) => social?.profiles.get(f.userId) ?? [])
    .sort((a, b) => Number(joined.has(a.id)) - Number(joined.has(b.id)) || a.display_name.localeCompare(b.display_name));
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function inviteFriend(id: string, name: string) {
    setSending(id);
    try {
      const dm = await openDmAction({ userId: id });
      const sent = dm.ok && dm.data
        ? await sendDirectMessageAction({ id: crypto.randomUUID(), conversationId: dm.data.conversationId, content: `Join me in **${server.name}** on Diskarte: ${url}` })
        : dm;
      if (!sent.ok) {
        toast.error(sent.error ?? `Couldn't invite ${name}.`);
        return;
      }
      setInvited((prev) => new Set(prev).add(id));
    } catch {
      toast.error(`Couldn't reach Diskarte. ${name} wasn't invited.`);
    } finally {
      setSending(null);
    }
  }

  async function share() {
    try {
      await navigator.share({ title: `Join ${server.name} on Diskarte`, text: `Join me in ${server.name} on Diskarte!`, url });
    } catch {
      // Closing the share sheet rejects too; nothing to report.
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — select the link instead.");
    }
  }

  function regenerate() {
    startTransition(async () => {
      const result = await regenerateInviteAction({ serverId: server.id });
      if (result.ok && result.data) {
        setCode(result.data.code);
        toast.success("New invite link created. The old one no longer works.");
      } else toast.error(result.error ?? "Couldn't reset.");
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={`Invite friends to ${server.name}`} description="Send it to a friend, or share the link anywhere.">
      {friends.length > 0 && (
        <section aria-label="Your friends" className="mb-4">
          <h3 className="mb-1.5 font-silk text-[11px] uppercase tracking-wider text-slate-300">Your friends</h3>
          <ul className="scrollbar-thin -mx-1 max-h-56 space-y-0.5 overflow-y-auto px-1" data-testid="invite-friends">
            {friends.map((f) => {
              const state = joined.has(f.id) ? "Joined" : invited.has(f.id) ? "Invited" : null;
              return (
                <li key={f.id} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-white/5">
                  <UserAvatar profile={f} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-100">{f.display_name}</span>
                    <span className="block truncate text-xs text-slate-500">@{f.username}</span>
                  </span>
                  {state ? (
                    <span className="flex items-center gap-1 px-2 text-xs text-slate-400">
                      <Check className="size-3.5" aria-hidden /> {state}
                    </span>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => void inviteFriend(f.id, f.display_name)} loading={sending === f.id} disabled={sending !== null} aria-label={`Invite ${f.display_name}`}>
                      <Send className="size-3.5" aria-hidden /> Invite
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <label htmlFor="invite-url" className="mb-1.5 block font-silk text-[11px] uppercase tracking-wider text-slate-300">
        Invite link
      </label>
      <div className="flex gap-2">
        <input id="invite-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="h-10 flex-1 rounded-lg border border-white/10 bg-black/50 px-3 font-mono text-sm text-slate-100" data-testid="invite-url" />
        <Button onClick={copy} aria-label="Copy invite link">
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </Button>
        {canShare && (
          <Button variant="ghost" onClick={() => void share()} aria-label="Share invite link">
            <Share2 className="size-4" aria-hidden />
          </Button>
        )}
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
