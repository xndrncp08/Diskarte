"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { motion, Reorder, useDragControls } from "framer-motion";
import { BadgeCheck, Plus, ShieldCheck } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";
import { DiskarteLogo } from "@/components/brand/DiskarteLogo";
import { useOptionalSocial } from "@/components/providers/SocialProvider";
import { Tooltip } from "@/components/ui/Tooltip";
import type { Server } from "@/lib/servers";
import { cn } from "@/lib/utils";
import { NotificationHub } from "@/components/workspace/NotificationHub";
import { WorkspacePresets } from "@/components/workspace/WorkspacePresets";
import { useIsCanvas, useOptionalWorkspaceStore, useWorkspace, type WorkspaceStore } from "@/components/workspace/WorkspaceProvider";
import { usePlatformRole } from "@/components/admin/AdminAccess";
import { useContextMenu } from "@/components/ui/ContextMenu";
import { AddServerDialog } from "./AddServerDialog";
import { ServerContextMenu } from "./ServerContextMenu";
import { ServerIcon } from "./ServerIcon";

function Pill({ active }: { active: boolean }) {
  return (
    <span className="absolute -left-3 top-1/2 flex h-10 w-1 -translate-y-1/2 items-center" aria-hidden>
      {active ? (
        <motion.span layoutId="rail-pill" className="h-10 w-1 rounded-r bg-sun" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
      ) : (
        <span className="h-0 w-1 rounded-r bg-white transition-[height] duration-150 group-hover:h-5" />
      )}
    </span>
  );
}

/** A server node on the rail; right-click for its menu (copy invite, leave…). */
function RailServer({ server, active, official = false }: { server: Server; active: boolean; official?: boolean }) {
  const menu = useContextMenu();
  return (
    <>
      {official ? (
        <Tooltip label={`${server.name} · Official`}>
          <Link
            href={`/tambayan/${server.id}`}
            aria-label={`${server.name} (official)`}
            aria-current={active ? "page" : undefined}
            className="group relative flex"
            data-testid="pinned-server"
            {...menu.triggerProps}
          >
            <Pill active={active} />
            <span className="rounded-[50%] ring-2 ring-sun ring-offset-2 ring-offset-[#0b1020] transition-[border-radius] group-hover:rounded-2xl">
              <ServerIcon server={server} active={active} />
            </span>
            <BadgeCheck className="absolute -bottom-1 -right-1 size-5 rounded-full bg-abyss fill-sun text-abyss" aria-hidden />
          </Link>
        </Tooltip>
      ) : (
        <Tooltip label={server.name}>
          <Link href={`/tambayan/${server.id}`} aria-label={server.name} aria-current={active ? "page" : undefined} draggable={false} className="group relative flex" {...menu.triggerProps}>
            <Pill active={active} />
            <ServerIcon server={server} active={active} />
          </Link>
        </Tooltip>
      )}
      <ServerContextMenu menu={menu} server={server} />
    </>
  );
}

// The rail's server order is personal, so it lives in this browser (new servers join at the bottom).
// shortcut: per browser, not synced across devices; move it to a server_members column if people ask.
const ORDER_KEY = "diskarte:server-order";
const orderListeners = new Set<() => void>();
let memoryOrder: string | null = null;

function readOrder() {
  try {
    return localStorage.getItem(ORDER_KEY) ?? "";
  } catch {
    return memoryOrder ?? "";
  }
}

function saveOrder(ids: string[]) {
  memoryOrder = ids.join(",");
  try {
    localStorage.setItem(ORDER_KEY, memoryOrder);
  } catch {
    // Private mode: keep it for this session only.
  }
  orderListeners.forEach((l) => l());
}

function subscribeOrder(listener: () => void) {
  orderListeners.add(listener);
  return () => {
    orderListeners.delete(listener);
  };
}

/** Saved ids first, in their saved order; servers the saved order doesn't know keep their place after them. */
export function sortByOrder(ids: string[], saved: string) {
  const rank = new Map(saved.split(",").map((id, i) => [id, i]));
  return [...ids].sort((a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity) || ids.indexOf(a) - ids.indexOf(b));
}

/** A reorderable rail node: mice drag the icon (it lifts after a few pixels, so clicks still open it); Alt+↑/↓ moves it too. */
function RailItem({ server, active, onDragEnd, onMove }: { server: Server; active: boolean; onDragEnd: () => void; onMove: (delta: -1 | 1) => void }) {
  const drag = useDragControls();
  // A dragged icon must not also follow its link on release.
  const dragged = useRef(false);
  return (
    <Reorder.Item
      as="li"
      value={server.id}
      dragListener={false}
      dragControls={drag}
      onDragStart={() => (dragged.current = true)}
      onDragEnd={onDragEnd}
      whileDrag={{ scale: 1.1, zIndex: 10 }}
      transition={{ type: "spring", stiffness: 600, damping: 40, mass: 0.6 }}
      className="relative [&_img]:[-webkit-user-drag:none]"
      onPointerDown={(e) => {
        dragged.current = false;
        if (e.pointerType === "mouse" && e.button === 0) drag.start(e);
      }}
      onClickCapture={(e) => {
        if (dragged.current) e.preventDefault();
      }}
      onKeyDown={(e) => {
        if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
        e.preventDefault();
        const focused = e.target as HTMLElement;
        onMove(e.key === "ArrowUp" ? -1 : 1);
        // React moves the node, which drops focus; keep it for repeated presses.
        requestAnimationFrame(() => focused.focus());
      }}
    >
      <RailServer server={server} active={active} />
    </Reorder.Item>
  );
}

const RAIL_BUTTON = "flex size-11 items-center justify-center rounded-2xl text-slate-300 transition-colors hover:bg-white/10 hover:text-white aria-pressed:bg-sun/15 aria-pressed:text-sun";

/** Super admins: toggles the Control Center panel on the canvas. */
function ControlCenterToggle({ store }: { store: WorkspaceStore }) {
  const open = useWorkspace((s) => !s.panels.admin.closed && !s.panels.admin.minimized);
  return (
    <Tooltip label={open ? "Close the Control Center" : "Control Center"} side="right">
      <button
        type="button"
        aria-label="Control Center"
        aria-pressed={open}
        onClick={() => (open ? store.setClosed("admin", true) : store.openPanel("admin"))}
        className={RAIL_BUTTON}
        data-testid="control-center-toggle"
      >
        <ShieldCheck className="size-5" aria-hidden />
      </button>
    </Tooltip>
  );
}

/** The Control Center entry on the rail: a panel toggle on the canvas, a link to its page on phones. */
function ControlCenterButton() {
  const role = usePlatformRole();
  const workspace = useOptionalWorkspaceStore();
  const isCanvas = useIsCanvas();
  if (role !== "super_admin") return null;
  if (workspace && isCanvas) return <ControlCenterToggle store={workspace} />;
  return (
    <Tooltip label="Control Center" side="right">
      <Link href="/tambayan/admin" aria-label="Control Center" className={RAIL_BUTTON} data-testid="control-center-toggle">
        <ShieldCheck className="size-5" aria-hidden />
      </Link>
    </Tooltip>
  );
}

/**
 * The floating command rail: the mascot (Home), quick server-switcher nodes, the notification hub and
 * workspace layout presets. A glass column on tablets and up; the left part of the drawer on phones.
 */
export function ServerRail({ servers }: { servers: Server[] }) {
  const params = useParams<{ serverId?: string }>();
  const activeId = params.serverId;
  const [adding, setAdding] = useState(false);
  const attention = useOptionalSocial()?.attention ?? 0;
  const workspace = useOptionalWorkspaceStore();
  // Diskarte HQ, the global server everyone belongs to, is pinned first with a gold ring.
  const hq = servers.find((s) => s.is_system);
  const byId = new Map(servers.filter((s) => !s.is_system).map((s) => [s.id, s]));
  const saved = useSyncExternalStore(subscribeOrder, readOrder, () => "");
  // The order being dragged; a ref too, so drag-end reads the final order.
  const [dragIds, setDragIds] = useState<string[] | null>(null);
  const dragRef = useRef(dragIds);
  function drafting(ids: string[] | null) {
    dragRef.current = ids;
    setDragIds(ids);
  }
  const ids = dragIds ?? sortByOrder([...byId.keys()], saved);

  return (
    <div
      className="pt-safe flex h-full w-[72px] shrink-0 flex-col items-center gap-2 pb-3 max-md:bg-abyss md:rounded-[2rem] md:border md:border-white/10 md:bg-slate-900/60 md:py-3 md:shadow-2xl md:shadow-black/50 md:backdrop-blur-2xl"
      data-testid="micro-dock"
    >
      <nav aria-label="Servers" className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-y-auto scrollbar-none">
        <Tooltip label="Home">
          <Link href="/tambayan" aria-label={attention ? `Home (${attention} new)` : "Home"} aria-current={!activeId ? "page" : undefined} className="group relative flex">
            <Pill active={!activeId} />
            <span className={cn("flex size-12 items-center justify-center bg-midnight transition-[border-radius,background-color] duration-200", !activeId ? "rounded-2xl bg-sun/15" : "rounded-[50%] group-hover:rounded-2xl")}>
              <DiskarteLogo size={40} title="Diskarte home" />
            </span>
            {attention > 0 && (
              <span className="absolute -bottom-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full border-2 border-abyss bg-red-600 px-1 font-silk text-[10px] font-bold tabular-nums text-white" aria-hidden data-testid="home-badge">
                {attention > 9 ? "9+" : attention}
              </span>
            )}
          </Link>
        </Tooltip>
        <div className="mx-auto h-0.5 w-8 shrink-0 rounded bg-white/10" />
        {hq && <RailServer server={hq} active={activeId === hq.id} official />}
        <Reorder.Group as="ul" axis="y" values={ids} onReorder={drafting} className="flex flex-col items-center gap-2" data-testid="server-list">
          {ids.flatMap((id) => byId.get(id) ?? []).map((server) => (
            <RailItem
              key={server.id}
              server={server}
              active={activeId === server.id}
              onDragEnd={() => {
                if (dragRef.current) saveOrder(dragRef.current);
                drafting(null);
              }}
              onMove={(delta) => {
                const next = [...ids];
                const from = next.indexOf(server.id);
                const to = from + delta;
                if (to < 0 || to >= next.length) return;
                [next[from], next[to]] = [next[to], next[from]];
                saveOrder(next);
              }}
            />
          ))}
        </Reorder.Group>
        <Tooltip label="Create or join a server">
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label="Add a server"
            aria-haspopup="dialog"
            className="group flex size-12 shrink-0 items-center justify-center rounded-[50%] bg-midnight text-signal-green transition-[border-radius,background-color,color] duration-200 hover:rounded-2xl hover:bg-signal-green hover:text-white"
          >
            <Plus className="size-6" aria-hidden />
          </button>
        </Tooltip>
      </nav>

      <section aria-label="Workspace controls" className="flex shrink-0 flex-col items-center gap-1.5 border-t border-white/[0.06] pt-2">
        <ControlCenterButton />
        <NotificationHub />
        {workspace && <WorkspacePresets />}
      </section>
      <AddServerDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
