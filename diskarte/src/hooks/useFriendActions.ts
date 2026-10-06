"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { toast } from "sonner";
import { blockUserAction, openDmAction, removeFriendAction, respondFriendRequestAction, sendFriendRequestAction } from "@/actions/social";
import { useOptionalSocial } from "@/components/providers/SocialProvider";

type Result = { ok: boolean; error?: string; fieldErrors?: Record<string, string | undefined> };

/**
 * Friend / block / DM actions with the app's toasts, shared by the Add Friend button and the person
 * context menu. Each resolves `true` on success; the friends list refreshes itself afterwards.
 */
export function useFriendActions() {
  const social = useOptionalSocial();
  const router = useRouter();
  const reload = social?.reload;
  const reloadConversations = social?.reloadConversations;

  return useMemo(() => {
    async function run(action: () => Promise<Result>, success: string) {
      const result = await action();
      if (!result.ok) {
        toast.error(result.fieldErrors?.username ?? result.error ?? "Something went wrong.");
        return false;
      }
      toast.success(success);
      await reload?.();
      return true;
    }

    return {
      async add(username: string) {
        const result = await sendFriendRequestAction({ username });
        if (!result.ok) {
          toast.error(result.fieldErrors?.username ?? result.error ?? "Couldn't send the friend request.");
          return false;
        }
        toast.success(result.data?.status === "accepted" ? "You're now friends!" : `Friend request sent to @${username.replace(/^@/, "")}.`);
        await reload?.();
        return true;
      },
      accept: (userId: string) => run(() => respondFriendRequestAction({ userId, accept: true }), "You're now friends!"),
      ignore: (userId: string) => run(() => respondFriendRequestAction({ userId, accept: false }), "Request ignored."),
      cancel: (userId: string) => run(() => removeFriendAction({ userId }), "Friend request cancelled."),
      remove: (userId: string) => run(() => removeFriendAction({ userId }), "Removed friend."),
      block: (userId: string) => run(() => blockUserAction({ userId, block: true }), "Blocked."),
      unblock: (userId: string) => run(() => blockUserAction({ userId, block: false }), "Unblocked."),
      async message(userId: string) {
        const result = await openDmAction({ userId });
        if (!result.ok || !result.data) {
          toast.error(result.error ?? "Couldn't open the DM.");
          return false;
        }
        await reloadConversations?.();
        router.push(`/tambayan/dm/${result.data.conversationId}`);
        return true;
      },
    };
  }, [reload, reloadConversations, router]);
}
