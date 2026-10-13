"use client";

import { Hash, MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { sendMessageAction } from "@/actions/messages";
import { sendDirectMessageAction } from "@/actions/social";
import { useServer } from "@/components/providers/ServerProvider";
import { useOptionalSocial } from "@/components/providers/SocialProvider";
import { Modal } from "@/components/ui/Modal";
import { conversationTitle } from "@/lib/social";

const MAX = 4000;

/** The forwarded copy: a quote that says who wrote it and where (attachments stay where they are). */
export function forwardText(content: string, author: string, channel: string) {
  const quoted = content
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  const text = `> **Forwarded** from ${author} in #${channel}\n${quoted}`;
  return text.length > MAX ? `${text.slice(0, MAX - 1)}…` : text;
}

/** Discord's Forward: pick a channel in this server or one of your DMs. */
export function ForwardDialog({ message, author, sourceChannel, onClose }: { message: { content: string } | null; author: string; sourceChannel: string; onClose: () => void }) {
  const { channels } = useServer();
  const social = useOptionalSocial();
  const [filter, setFilter] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const q = filter.trim().toLowerCase();
  const targets = [
    ...channels.filter((c) => c.type === "text").map((c) => ({ key: `c:${c.id}`, id: c.id, kind: "channel" as const, label: c.name })),
    ...(social?.conversations ?? []).map((c) => ({ key: `d:${c.id}`, id: c.id, kind: "dm" as const, label: conversationTitle(c) })),
  ].filter((t) => !q || t.label.toLowerCase().includes(q));

  async function send(target: (typeof targets)[number]) {
    if (!message) return;
    setSending(target.key);
    const content = forwardText(message.content, author, sourceChannel);
    const id = crypto.randomUUID();
    const result = target.kind === "channel" ? await sendMessageAction({ id, channelId: target.id, content, attachments: [] }) : await sendDirectMessageAction({ id, conversationId: target.id, content });
    setSending(null);
    if (!result.ok) return void toast.error(result.error ?? "Couldn't forward it.");
    toast.success(`Forwarded to ${target.kind === "channel" ? "#" : ""}${target.label}.`);
    onClose();
  }

  return (
    <Modal open={message !== null} onClose={onClose} title="Forward to" className="max-w-md">
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search channels and DMs"
        aria-label="Search channels and DMs"
        data-autofocus
        className="mb-3 h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white outline-none focus:border-sun/70"
      />
      <ul className="scrollbar-thin max-h-72 space-y-0.5 overflow-y-auto" aria-label="Destinations">
        {targets.length === 0 && <li className="py-6 text-center text-sm text-slate-400">No matches.</li>}
        {targets.map((t) => (
          <li key={t.key}>
            <button
              type="button"
              disabled={sending !== null}
              onClick={() => void send(t)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-slate-200 hover:bg-white/10 disabled:opacity-50"
            >
              {t.kind === "channel" ? <Hash className="size-4 text-slate-500" aria-hidden /> : <MessageCircle className="size-4 text-slate-500" aria-hidden />}
              <span className="min-w-0 flex-1 truncate">{t.label}</span>
              {sending === t.key && <span className="text-xs text-slate-400">Sending…</span>}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
