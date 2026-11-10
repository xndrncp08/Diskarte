"use client";

import type { ComponentProps } from "react";
import { ContextMenu as BaseContextMenu } from "@/components/ui/ContextMenu";
import { Menu as BaseMenu, MenuSkinContext, type MenuSkin } from "@/components/ui/Menu";

export { ContextMenuItems, useContextMenu, useContextMenuPick } from "@/components/ui/ContextMenu";
export type { MenuItem } from "@/components/ui/Menu";

// Keyboard focus shows as the selected tint plus a gold bar at the row's start (shape, not only colour).
const PULSE_MENU: MenuSkin = {
  panel: "rounded-pulse-item border border-pulse-line bg-pulse-raised p-1.5 font-pulse-text text-pulse-text shadow-pulse-2",
  section: "mt-1 border-t border-pulse-line pt-1",
  groupLabel: "px-2.5 pb-0.5 pt-1.5 text-pulse-caption font-semibold text-pulse-muted",
  control: "px-2.5 py-1.5 text-pulse-body text-pulse-text",
  row: "flex min-h-9 w-full items-center gap-2 rounded-pulse-control px-2.5 py-1.5 text-left text-pulse-body outline-none transition-colors pointer-coarse:min-h-11 [&_svg]:size-4",
  plain: "text-pulse-text hover:bg-pulse-hover focus-visible:bg-pulse-selected focus-visible:shadow-[inset_3px_0_0_var(--pulse-accent-mark)]",
  danger: "text-pulse-alert hover:bg-pulse-mention focus-visible:bg-pulse-mention focus-visible:shadow-[inset_3px_0_0_var(--pulse-alert)]",
  checked: "font-semibold",
  check: "size-4 shrink-0 text-pulse-accent-ink",
};

/**
 * Pulse dropdown menu: the shared Menu (portalled, flips at edges, arrows/Home/End move, Escape closes and
 * returns focus to the trigger, outside press dismisses, radio/checkbox items) in a raised Pulse panel.
 * Props are Menu's: `label` names the menu; `trigger` renders the opener (give it aria-haspopup="menu" and aria-expanded).
 */
export function Menu(props: ComponentProps<typeof BaseMenu>) {
  return (
    <MenuSkinContext.Provider value={PULSE_MENU}>
      <BaseMenu {...props} />
    </MenuSkinContext.Provider>
  );
}

/**
 * Pulse context menu (right-click, long-press, Shift+F10): the shared ContextMenu in the Pulse panel. Use with
 * `useContextMenu()` and `<ContextMenuItems>` exactly as in Classic; rows inside pick up the Pulse skin.
 */
export function ContextMenu(props: ComponentProps<typeof BaseContextMenu>) {
  return (
    <MenuSkinContext.Provider value={PULSE_MENU}>
      <BaseContextMenu {...props} />
    </MenuSkinContext.Provider>
  );
}
