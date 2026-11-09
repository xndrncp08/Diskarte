"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { joinServerAction } from "@/actions/servers";
import { Button } from "@/components/ui/Button";
import { JoinScreeningDialog } from "./JoinScreening";

export function JoinInviteButton({ code }: { code: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [screening, setScreening] = useState(false);
  const enter = (serverId: string) => {
    router.push(`/tambayan/${serverId}`);
    router.refresh();
  };
  return (
    <>
    <Button
      size="lg"
      className="w-full"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await joinServerAction({ invite: code });
          if (result.code === "SCREENING_REQUIRED") return setScreening(true);
          if (!result.ok || !result.data) {
            toast.error(result.error ?? result.fieldErrors?.invite ?? "Couldn't join.");
            return;
          }
          enter(result.data.serverId);
        })
      }
    >
      Join server
    </Button>
    <JoinScreeningDialog target={screening ? { invite: code } : null} onClose={() => setScreening(false)} onJoined={enter} />
    </>
  );
}
