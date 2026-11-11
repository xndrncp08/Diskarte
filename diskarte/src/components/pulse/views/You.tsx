"use client";

import { Bell, Pencil, UserRound } from "lucide-react";
import { useId } from "react";
import { useMe } from "@/components/providers/MeProvider";
import { useSettingsDialog } from "@/components/profile/SettingsDialog";
import type { RailEntry } from "@/components/shell/ServerRail";
import { useStatusMenu } from "@/components/shell/UserPanel";
import type { MenuItem } from "@/components/ui/Menu";
import { NotificationHub } from "@/components/workspace/NotificationHub";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import { Avatar } from "../Avatar";
import { Button } from "../Button";
import { Masthead } from "../shell/Masthead";
import { useYouItems } from "../shell/Navigator";

const ROW = "flex min-h-11 w-full items-center gap-3 rounded-pulse-item px-3 py-2 text-left text-pulse-body hover:bg-pulse-hover active:bg-pulse-pressed aria-pressed:bg-pulse-selected aria-pressed:font-semibold [&_svg]:size-4 [&_svg]:shrink-0";

/** Menu items (the status menu's and the You menu's) as page sections: one h2 per group, choices as pressed toggles. */
function Sections({ items }: { items: MenuItem[] }) {
  const id = useId();
  const groups = new Map<string, MenuItem[]>(); // not Map.groupBy: iOS 16 lacks it
  for (const item of items) if (!item.hidden) groups.set(item.group ?? "", [...(groups.get(item.group ?? "") ?? []), item]);
  return [...groups].map(([group, rows], index) => (
    <section key={group} aria-labelledby={`${id}-${index}`} className="mt-4">
      <h2 id={`${id}-${index}`} className="px-3 pb-1 text-pulse-caption font-semibold uppercase tracking-wide text-pulse-muted">{group}</h2>
      <ul>
        {rows.map((item) => (
          <li key={item.label}>
            <button type="button" onClick={item.onSelect} aria-pressed={item.checked} className={item.danger ? `${ROW} text-pulse-alert` : ROW}>
              {item.icon && <span aria-hidden className="inline-flex">{item.icon}</span>}
              <span className="min-w-0 flex-1">{item.label}{item.hint && <span className="block text-pulse-caption text-pulse-muted">{item.hint}</span>}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  ));
}

/**
 * The phone You tab (`/tambayan/you`, a plain page on wider screens): your face and status, the status and custom
 * status choices (useStatusMenu, the same as the You menu), notifications (the hub, and their settings), Settings,
 * the Control Center for super admins and Back to Classic (useYouItems), last, within thumb reach.
 */
export function PulseYou({ servers }: { servers: RailEntry[] }) {
  const { me } = useMe();
  const { items, label } = useStatusMenu();
  const you = useYouItems();
  const settings = useSettingsDialog();
  const status = me.status === "invisible" ? "offline" : me.status;
  const notifications: MenuItem = { label: "Notification settings", icon: <Bell />, group: "You", onSelect: () => settings?.openSettings("notifications"), hidden: !settings };
  return (
    <WorkspacePanel id="main" title="You">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col font-pulse-text text-pulse-text">
        <Masthead title="You" icon={<UserRound />} actions={<NotificationHub servers={servers} />} />
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl p-3 md:p-6">
            <div className="flex items-center gap-3 rounded-pulse-card bg-pulse-surface p-4 shadow-pulse-1">
              <Avatar profile={me} size={56} status={status} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-pulse-display text-pulse-title font-semibold">{me.display_name}</p>
                <p className="truncate text-pulse-label text-pulse-muted">{label}</p>
              </div>
              {settings && <Button size="sm" icon={<Pencil />} onClick={() => settings.openSettings("profile")}>Edit profile</Button>}
            </div>
            <Sections items={[...items, notifications, ...you]} />
          </div>
        </div>
      </section>
    </WorkspacePanel>
  );
}
