"use client";

import { ArrowRight, Link2, LogOut } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { leaveServerAction } from "@/actions/servers";
import { useMe } from "@/components/providers/MeProvider";
import { useOptionalRuntimeConfig } from "@/components/providers/RuntimeConfig";
import { confirmAction } from "@/components/ui/ConfirmHost";
import { ContextMenu, ContextMenuItems, copyText, type ContextMenuState } from "@/components/ui/ContextMenu";
import { inviteUrl, type Server } from "@/lib/servers";

const icon = "size-4";

/** Right-click on a server (the rail, Home's server list): open it, copy its invite, leave it. */
function ServerMenuItems({ server }: { server: Server }) {
  const { me } = useMe();
  const router = useRouter();
  const active = useParams<{ serverId?: string }>().serverId === server.id;
  const siteUrl = useOptionalRuntimeConfig()?.siteUrl ?? window.location.origin;

  return (
    <ContextMenuItems
      items={[
        { label: "Open server", icon: <ArrowRight className={icon} aria-hidden />, onSelect: () => router.push(`/tambayan/${server.id}`), hidden: active },
        {
          label: "Copy invite link",
          icon: <Link2 className={icon} aria-hidden />,
          onSelect: () => void copyText(inviteUrl(siteUrl, server.invite_code), "Invite link"),
          // Everyone is already in Diskarte HQ.
          hidden: server.is_system || !server.invite_code,
        },
        {
          label: "Leave server",
          icon: <LogOut className={icon} aria-hidden />,
          danger: true,
          // Nobody leaves Diskarte HQ; owners leave by deleting their server.
          hidden: server.is_system || server.owner_id === me.id,
          onSelect: () =>
            confirmAction({
              title: `Leave ${server.name}?`,
              body: "You'll need a new invite to come back.",
              confirmLabel: "Leave",
              onConfirm: async () => {
                const result = await leaveServerAction({ serverId: server.id });
                if (!result.ok) {
                  toast.error(result.error ?? "Couldn't leave.");
                  return false;
                }
                toast(`You left ${server.name}.`);
                if (active) router.replace("/tambayan");
                router.refresh();
              },
            }),
        },
      ]}
    />
  );
}

export function ServerContextMenu({ menu, server }: { menu: ContextMenuState; server: Server }) {
  return (
    <ContextMenu menu={menu} label={`${server.name} options`}>
      <ServerMenuItems server={server} />
    </ContextMenu>
  );
}
