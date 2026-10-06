"use client";

import { MessageCircle, UserCheck, UserPlus, UserX } from "lucide-react";
import { useTransition } from "react";
import { useMe } from "@/components/providers/MeProvider";
import { useOptionalSocial } from "@/components/providers/SocialProvider";
import { Button } from "@/components/ui/Button";
import { useFriendActions } from "@/hooks/useFriendActions";
import { friendStatus } from "@/lib/social";
import { cn } from "@/lib/utils";

/**
 * The friend control on someone's profile card: Add Friend → Cancel request (sent) / Accept
 * (they asked first) → Friends, always next to a Message button. Hidden on your own card, for
 * people you blocked, and outside the signed-in app (no friends list to read).
 */
export function FriendButton({ userId, username, className }: { userId: string; username: string; className?: string }) {
  const social = useOptionalSocial();
  const { me } = useMe();
  const actions = useFriendActions();
  const [pending, startTransition] = useTransition();
  const status = social ? friendStatus(me.id, userId, social.friends, social.blocked) : null;
  if (status === null || status === "self" || status === "blocked") return null;

  const run = (action: () => Promise<boolean>) => startTransition(async () => void (await action()));

  return (
    <div className={cn("flex gap-1.5", className)} data-testid="friend-button" data-status={status}>
      {status === "none" && (
        <Button size="sm" className="flex-1" loading={pending} onClick={() => run(() => actions.add(username))}>
          <UserPlus className="size-4" aria-hidden /> Add Friend
        </Button>
      )}
      {status === "outgoing" && (
        <Button size="sm" variant="secondary" className="flex-1" loading={pending} onClick={() => run(() => actions.cancel(userId))} title="Friend request sent — click to cancel">
          <UserX className="size-4" aria-hidden /> Cancel request
        </Button>
      )}
      {status === "incoming" && (
        <Button size="sm" className="flex-1" loading={pending} onClick={() => run(() => actions.accept(userId))}>
          <UserCheck className="size-4" aria-hidden /> Accept request
        </Button>
      )}
      {status === "accepted" && (
        <span className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 text-xs font-semibold text-emerald-200">
          <UserCheck className="size-4" aria-hidden /> Friends
        </span>
      )}
      <Button size="sm" variant={status === "accepted" ? "primary" : "secondary"} className={cn(status === "accepted" && "flex-1")} disabled={pending} onClick={() => run(() => actions.message(userId))} aria-label="Message">
        <MessageCircle className="size-4" aria-hidden />
        {status === "accepted" && " Message"}
      </Button>
    </div>
  );
}
