"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { joinServerAction } from "@/actions/servers";
import { Button } from "@/components/ui/Button";

export function JoinInviteButton({ code }: { code: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="lg"
      className="w-full"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await joinServerAction({ invite: code });
          if (!result.ok || !result.data) {
            toast.error(result.error ?? result.fieldErrors?.invite ?? "Hindi naka-join.");
            return;
          }
          router.push(`/tambayan/${result.data.serverId}`);
          router.refresh();
        })
      }
    >
      Sumali sa tambayan
    </Button>
  );
}
