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
import { PixelStatus } from "@/components/retro/PixelStatus";
import { Menu } from "@/components/ui/Menu";
import { Tooltip } from "@/components/ui/Tooltip";
import { PRESENCE_OPTIONS, STATUS_TRIGGERS } from "@/lib/profile";
import type { PresenceStatus } from "@/lib/supabase/database.types";

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

  const items = [
    ...PRESENCE_OPTIONS.map((opt) => ({
      label: opt.label,
      icon: <PixelStatus status={opt.value} size={12} />,
      onSelect: () => apply({ status: opt.value }),
    })),
    ...STATUS_TRIGGERS.slice(0, 5).map((t) => ({
      label: `${t.emoji} ${t.text}`,
      onSelect: () => apply({ customStatus: t.text, customStatusEmoji: t.emoji }),
    })),
    { label: "Clear custom status", onSelect: () => apply({ customStatus: null, customStatusEmoji: null }), hidden: !me.custom_status && !me.custom_status_emoji },
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
            aria-label={`Set status (currently ${me.status})`}
            className="flex w-full min-w-0 items-center gap-2 rounded-md p-1 text-left transition-colors hover:bg-white/10 pointer-coarse:py-1.5"
          >
            <UserAvatar profile={me} size={32} status={me.status === "invisible" ? "offline" : me.status} ring="#0b1020" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white">{me.display_name}</span>
              <span className="block truncate text-[11px] text-slate-400">
                {me.custom_status ? `${me.custom_status_emoji ?? ""} ${me.custom_status}`.trim() : `@${me.username}`}
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
