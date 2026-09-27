"use client";

import { Check, Copy, Rocket } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useServer } from "@/components/providers/ServerProvider";
import { Modal } from "@/components/ui/Modal";
import { BADGES, BADGE_KINDS, boostLevel, formatMobile } from "@/lib/community";
import { cn } from "@/lib/utils";
import { Badges } from "./Badges";

function CopyNumber({ label, number, className }: { label: string; number: string; className: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-xl border p-3", className)}>
      <div>
        <p className="font-silk text-[11px] uppercase tracking-wider opacity-80">{label}</p>
        <p className="font-mono text-lg font-bold tracking-wide">{formatMobile(number)}</p>
      </div>
      <button
        type="button"
        aria-label={`Copy ${label} number`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(number);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            toast.error("Hindi ma-copy. Kopyahin na lang nang mano-mano.");
          }
        }}
        className="touch-target relative rounded-lg bg-black/30 p-2 hover:bg-black/50"
      >
        {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      </button>
    </div>
  );
}

/** "Suportahan ang tambayan": GCash/Maya details, boost level and the supporters wall. */
export function SupportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { server, badges, members } = useServer();
  const boosters = members.filter((m) => badges.get(m.user_id)?.includes("booster")).length;
  const { level, next } = boostLevel(boosters);
  const supporters = members.filter((m) => (badges.get(m.user_id)?.length ?? 0) > 0);
  const hasNumbers = Boolean(server.gcash_number || server.maya_number);

  return (
    <Modal open={open} onClose={onClose} title={`Suportahan ang ${server.name}`} className="max-w-md">
      <div className="space-y-5" data-testid="support-dialog">
        <div className="rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-3">
          <p className="flex items-center gap-2 font-pixel text-[10px] text-fuchsia-200">
            <Rocket className="size-4" aria-hidden /> BOOST LEVEL {level}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/40" aria-hidden>
            <div className="h-full bg-fuchsia-400" style={{ width: `${next ? Math.min(100, (boosters / next) * 100) : 100}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-slate-300">
            {boosters} booster{boosters === 1 ? "" : "s"}
            {next ? ` · ${next - boosters} pa para sa Level ${level + 1}` : " · MAX LEVEL!"}
          </p>
        </div>

        {hasNumbers ? (
          <div className="space-y-2">
            {server.gcash_number && <CopyNumber label="GCash" number={server.gcash_number} className="border-sky-400/40 bg-sky-500/10 text-sky-100" />}
            {server.maya_number && <CopyNumber label="Maya" number={server.maya_number} className="border-emerald-400/40 bg-emerald-500/10 text-emerald-100" />}
            {server.support_note && <p className="rounded-lg bg-white/5 p-3 text-sm text-slate-300">{server.support_note}</p>}
            <p className="text-xs text-slate-500">
              Pagkatapos mag-send, i-message ang admins para sa badge mo. Walang automatic na payments sa Diskarte — diretso sa tambayan ang ambag mo.
            </p>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-sm text-slate-400">Hindi pa naglalagay ng GCash/Maya ang admins ng tambayan na &apos;to.</p>
        )}

        <div>
          <p className="mb-2 font-silk text-[11px] uppercase tracking-wider text-slate-400">Mga badge</p>
          <ul className="space-y-1.5">
            {BADGE_KINDS.map((b) => (
              <li key={b} className="flex items-center gap-2 text-sm">
                <span className={cn("rounded-md border px-1.5 py-0.5 text-xs font-semibold", BADGES[b].className)}>
                  {BADGES[b].emoji} {BADGES[b].label}
                </span>
                <span className="text-slate-400">{BADGES[b].description}</span>
              </li>
            ))}
          </ul>
        </div>

        {supporters.length > 0 && (
          <div>
            <p className="mb-2 font-silk text-[11px] uppercase tracking-wider text-slate-400">Salamat, mga lodi! 💛</p>
            <ul className="space-y-1">
              {supporters.map((m) => (
                <li key={m.user_id} className="flex items-center justify-between gap-2 text-sm text-slate-200">
                  <span className="truncate">{m.nickname ?? m.profile.display_name}</span>
                  <Badges badges={badges.get(m.user_id)} compact />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
