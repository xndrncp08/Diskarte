"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { createRoleAction, deleteRoleAction, updateRoleAction } from "@/actions/servers";
import { useServer } from "@/components/providers/ServerProvider";
import { Button } from "@/components/ui/Button";
import { confirmAction } from "@/components/ui/ConfirmHost";
import { ROLE_COLORS, type ServerRole } from "@/lib/servers";
import { cn } from "@/lib/utils";

function Swatches({ value, onChange, label }: { value: string; onChange: (color: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {ROLE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => onChange(c)}
          className={cn("size-6 rounded-full ring-offset-2 ring-offset-abyss transition-shadow pointer-coarse:size-9", value === c && "ring-2 ring-white")}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

function RoleRow({ role, holders }: { role: ServerRole; holders: number }) {
  const { reloadRoles } = useServer();
  const [name, setName] = useState(role.name);
  const [pending, startTransition] = useTransition();

  function save(next: { name: string; color: string }) {
    if (next.name.trim() === role.name && next.color === role.color) return;
    startTransition(async () => {
      const result = await updateRoleAction({ roleId: role.id, ...next });
      if (!result.ok) {
        toast.error(result.fieldErrors?.name ?? result.error ?? "Couldn't save the role.");
        setName(role.name);
        return;
      }
      reloadRoles();
    });
  }

  return (
    <li className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3" data-testid="role-row">
      <div className="flex items-center gap-2">
        <span className="size-3 shrink-0 rounded-full" style={{ background: role.color }} aria-hidden />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => save({ name, color: role.color })}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          maxLength={32}
          aria-label="Role name"
          disabled={pending}
          className="h-8 min-w-0 flex-1 rounded-md border border-white/10 bg-black/40 px-2 text-sm font-semibold outline-none focus:border-sun/70"
          style={{ color: role.color }}
        />
        <span className="shrink-0 text-xs text-slate-500">{holders === 1 ? "1 member" : `${holders} members`}</span>
        <button
          type="button"
          aria-label={`Delete ${role.name}`}
          onClick={() =>
            confirmAction({
              title: `Delete ${role.name}?`,
              body: "It's taken away from everyone, along with any private channels it opened.",
              confirmLabel: "Delete",
              onConfirm: async () => {
                const result = await deleteRoleAction({ roleId: role.id });
                if (!result.ok) {
                  toast.error(result.error ?? "Couldn't delete the role.");
                  return false;
                }
                reloadRoles();
              },
            })
          }
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-red-500/20 hover:text-red-300"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
      <Swatches value={role.color} onChange={(color) => save({ name, color })} label={`${role.name} colour`} />
    </li>
  );
}

/** Custom roles: name, colour, who has them. Hand them out from a member's right-click menu; private channels can be opened to a role. */
export function RolesSettings() {
  const { server, roles, memberRoles, reloadRoles } = useServer();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(ROLE_COLORS[5]);
  const [pending, startTransition] = useTransition();
  const holders = (id: string) => [...memberRoles.values()].filter((ids) => ids.includes(id)).length;

  function create(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createRoleAction({ serverId: server.id, name, color });
      if (!result.ok) {
        toast.error(result.fieldErrors?.name ?? result.error ?? "Couldn't create the role.");
        return;
      }
      setName("");
      reloadRoles();
      toast.success(`Created ${name.trim()}. Right-click a member to give it to them.`);
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3" aria-label="Create a role">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={32}
            placeholder="New role, e.g. Tropa"
            aria-label="New role name"
            className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white outline-none focus:border-sun/70"
          />
          <Button type="submit" size="sm" loading={pending} disabled={!name.trim()}>
            <Plus className="size-4" aria-hidden /> Create
          </Button>
        </div>
        <Swatches value={color} onChange={setColor} label="New role colour" />
      </form>
      {roles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">No roles yet. Create one to colour names and open private channels to a group.</p>
      ) : (
        <ul className="space-y-2" data-testid="roles-list">
          {[...roles].reverse().map((r) => (
            <RoleRow key={r.id} role={r} holders={holders(r.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}
