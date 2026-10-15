"use client";

import { Check, Copy, RefreshCw, Send, Share2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createInviteAction, regenerateInviteAction } from "@/actions/servers";
import { openDmAction, sendDirectMessageAction } from "@/actions/social";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { useOptionalSocial } from "@/components/providers/SocialProvider";
import { useServer } from "@/components/providers/ServerProvider";
import { useRuntimeConfig } from "@/components/providers/RuntimeConfig";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { INVITE_AGES, INVITE_USES, inviteExpiry, inviteUrl } from "@/lib/servers";

export function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { server, myRole, members } = useServer();
  const social = useOptionalSocial();
  const { siteUrl } = useRuntimeConfig();
  const [code, setCode] = useState<string | null>(null);
  // Set when the link shown is a limited invite (Edit invite link), not the server's permanent one.
  const [limits, setLimits] = useState<{ expiresAt: string | null; maxUses: number } | null>(null);
  const [maxAge, setMaxAge] = useState<number>(10080);
  const [maxUses, setMaxUses] = useState<number>(0);
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
        ? await sendDirectMessageAction({ id: crypto.randomUUID(), conversationId: dm.data.conversationId, content: `Join me in **${server.name}** on Diskarte: ${url}`, inviteServerId: server.id })
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
        setLimits(null);
        toast.success("New invite link created. The old one no longer works.");
      } else toast.error(result.error ?? "Couldn't reset.");
    });
  }

  function createLimited() {
    startTransition(async () => {
      const result = await createInviteAction({ serverId: server.id, maxAgeMinutes: maxAge, maxUses });
      if (!result.ok || !result.data) return void toast.error(result.error ?? "Couldn't create the invite.");
      setCode(result.data.code);
      setLimits({ expiresAt: result.data.expiresAt, maxUses });
      setCopied(false);
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
      <p className="mt-2 text-xs text-slate-500" data-testid="invite-limits">
        {limits ? `${inviteExpiry(limits.expiresAt)}${limits.maxUses ? ` · ${limits.maxUses} use${limits.maxUses === 1 ? "" : "s"}` : ""}.` : "This link never expires."} Code:{" "}
        <span className="font-mono text-slate-300">{current}</span>
      </p>
      {!server.is_system && (
        <details className="mt-3 rounded-lg border border-white/10 px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold text-slate-200">Edit invite link</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-300">
              Expire after
              <select value={maxAge} onChange={(e) => setMaxAge(Number(e.target.value))} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/40 px-2 text-sm font-normal text-white">
                {INVITE_AGES.map((a) => (
                  <option key={a.minutes} value={a.minutes}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-300">
              Max number of uses
              <select value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/40 px-2 text-sm font-normal text-white">
                {INVITE_USES.map((u) => (
                  <option key={u} value={u}>
                    {u === 0 ? "No limit" : `${u} use${u === 1 ? "" : "s"}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Button size="sm" className="mt-3" onClick={createLimited} loading={pending}>
            Generate a New Link
          </Button>
        </details>
      )}
      {myRole === "admin" && (
        <Button variant="ghost" size="sm" className="mt-4" onClick={regenerate} loading={pending}>
          <RefreshCw className="size-4" aria-hidden /> Reset invite link
        </Button>
      )}
    </Modal>
  );
}
