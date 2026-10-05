"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";
import { useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { setStatusAction } from "@/actions/profile";
import { useMe } from "@/components/providers/MeProvider";
import { useSettingsDialog } from "@/components/profile/SettingsDialog";
import { SoundSettingsPopover } from "@/components/profile/SoundSettingsPopover";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { PixelStatus, STATUS_LABELS, STATUS_RING } from "@/components/retro/PixelStatus";
import { Glyph } from "@/components/ui/Glyph";
import { Menu } from "@/components/ui/Menu";
import { Tooltip } from "@/components/ui/Tooltip";
import { PRESENCE_OPTIONS, STATUS_TRIGGERS } from "@/lib/profile";
import type { PresenceStatus } from "@/lib/supabase/database.types";
import { statusTone } from "@/lib/presence";
import { cn } from "@/lib/utils";

/** Bottom-left identity panel with the quick status switcher; `controls` slot hosts voice buttons. */
export function UserPanel({ controls }: { controls?: ReactNode }) {
  const { me, setMe } = useMe();
  const settings = useSettingsDialog();
  const router = useRouter();
  const [, startTransition] = useTransition();

  function apply(next: { status?: PresenceStatus; customStatus?: string | null; customStatusEmoji?: string | null }) {
    const previous = me;
    const status = next.status ?? me.status;
    const customStatus = next.customStatus !== undefined ? next.customStatus : me.custom_status;
    const customStatusEmoji = next.customStatusEmoji !== undefined ? next.customStatusEmoji : me.custom_status_emoji;
    setMe((p) => ({ ...p, status, custom_status: customStatus, custom_status_emoji: customStatusEmoji }));
    startTransition(async () => {
      const result = await setStatusAction({ status, customStatus, customStatusEmoji });
      if (!result.ok) {
        setMe(() => previous);
        toast.error(result.error ?? "Couldn't update your status.");
      } else {
        router.refresh();
      }
    });
  }

  // What everyone sees: the badge, ring and label all derive from this one value.
  const shown = statusTone(me.status === "invisible" ? "offline" : me.status, me.custom_status);
  const label = me.custom_status ?? STATUS_LABELS[me.status];

  const items = [
    ...PRESENCE_OPTIONS.map((opt) => ({
      label: opt.label,
      icon: <PixelStatus status={opt.value} size={12} />,
      checked: me.status === opt.value,
      group: "Status",
      onSelect: () => apply({ status: opt.value }),
    })),
    // A trigger sets its text *and* its presence (AFK / Tulog → Idle, Nag-aaral → Do Not Disturb…).
    ...STATUS_TRIGGERS.slice(0, 5).map((t) => ({
      label: t.text,
      icon: <Glyph code={t.glyph} className="size-4" />,
      checked: me.custom_status === t.text && me.custom_status_emoji === t.glyph,
      group: "Custom status",
      onSelect: () => apply({ status: t.status, customStatus: t.text, customStatusEmoji: t.glyph }),
    })),
    {
      label: "Clear custom status",
      group: "Custom status",
      onSelect: () => apply({ customStatus: null, customStatusEmoji: null }),
      hidden: !me.custom_status && !me.custom_status_emoji,
    },
  ];

  return (
    <div
      className="pb-safe flex items-center gap-1 border-t border-white/5 bg-black/40 px-2 pt-2 md:m-2 md:rounded-2xl md:border md:border-white/10 md:pb-2 md:shadow-lg md:shadow-black/30"
      data-testid="user-panel"
    >
      <Menu
        label="Set status"
        side="top"
        className="min-w-0 flex-1"
        items={items}
        trigger={({ toggle, open, id }) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls={id}
            aria-haspopup="menu"
            aria-label={`Set status (currently ${STATUS_LABELS[me.status]})`}
            className="flex w-full min-w-0 items-center gap-2 rounded-md p-1 text-left transition-colors hover:bg-white/10 pointer-coarse:py-1.5"
          >
            <span data-status-ring={shown} className={cn("shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-[#0b1020] transition-shadow duration-300", STATUS_RING[shown])}>
              <UserAvatar profile={me} size={32} status={shown} ring="#0b1020" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white">{me.display_name}</span>
              <span className="block truncate text-[11px] text-slate-400">
                <span data-testid="status-label" className="inline-flex min-w-0 max-w-full items-center gap-1">
                  {me.custom_status && <Glyph code={me.custom_status_emoji} className="size-3.5" />}
                  <span className="truncate">{label}</span>
                </span>
              </span>
            </span>
          </button>
        )}
      />
      {controls}
      <SoundSettingsPopover />
      <Tooltip label="User settings" side="top">
        {/* Opens the Settings dialog in place so a voice call stays connected; the link still
            works for new-tab clicks and outside the app shell. */}
        <Link
          href="/settings/profile"
          aria-label="User settings"
          aria-haspopup={settings ? "dialog" : undefined}
          onClick={(event) => {
            if (!settings || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            settings.openSettings();
          }}
          className="touch-target relative rounded-md p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white pointer-coarse:p-3.5"
        >
          <Settings className="size-4" aria-hidden />
        </Link>
      </Tooltip>
    </div>
  );
}
