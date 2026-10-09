"use client";

import type { ReactNode } from "react";
import { PRESENCE_LABEL, PLATFORM_ROLE_LABEL, type PlatformRole, type PresenceState } from "@/lib/admin";
import { cn } from "@/lib/utils";

/** Small building blocks shared by the Control Center tabs. */

export const PRESENCE_DOT: Record<PresenceState, string> = {
  online: "bg-signal-green",
  afk: "bg-signal-idle",
  canton: "bg-signal-custom",
  busy: "bg-signal-dnd",
  offline: "bg-signal-offline",
};

export function PresencePill({ state, invisible = false, className }: { state: PresenceState; invisible?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs text-slate-300", className)} data-presence={state}>
      {/* Square 8-bit status pixel; hollow when offline. */}
      <span className={cn("size-2 shrink-0", state === "offline" ? "border border-signal-offline" : PRESENCE_DOT[state])} aria-hidden />
      <span className="truncate">{PRESENCE_LABEL[state]}</span>
      {invisible && <span className="rounded border border-white/10 px-1 font-silk text-[9px] uppercase tracking-wider text-slate-400">Invisible</span>}
    </span>
  );
}

const ROLE_STYLE: Record<PlatformRole, string> = {
  super_admin: "border-sun/40 bg-sun/10 text-sun",
  moderator: "border-neon/40 bg-neon/10 text-neon",
  member: "border-white/10 bg-white/[0.04] text-slate-400",
};

export function RoleBadge({ role, className }: { role: PlatformRole; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 font-silk text-[9px] uppercase tracking-wider", ROLE_STYLE[role], className)}>
      {role === "member" ? "Member" : PLATFORM_ROLE_LABEL[role]}
    </span>
  );
}

export function SectionLabel({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <h3 id={id} className={cn("font-silk text-[10px] uppercase tracking-widest text-slate-400", className)}>
      {children}
    </h3>
  );
}

export const SELECT =
  "h-8 rounded-lg border border-white/10 bg-black/40 px-2 text-xs text-slate-200 outline-none transition-colors focus:border-sun/70 focus:ring-2 focus:ring-sun/20 pointer-coarse:h-11";

/** Accessible segmented control (a radio group styled as pills). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  className,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex flex-wrap gap-1 rounded-xl border border-white/10 bg-black/30 p-1", disabled && "opacity-50", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => {
            const i = options.findIndex((x) => x.value === value);
            const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
            if (!step) return;
            e.preventDefault();
            const next = options[(i + step + options.length) % options.length];
            onChange(next.value);
            (e.currentTarget.parentElement?.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null)?.focus();
          }}
          tabIndex={value === o.value ? 0 : -1}
          data-value={o.value}
          className="flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-slate-400 transition-colors hover:text-white aria-checked:bg-white/10 aria-checked:text-white pointer-coarse:h-10"
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}
