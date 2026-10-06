"use client";

import { useSyncExternalStore } from "react";

export interface OpenProfile {
  userId: string;
  /** Where the window first appears beside (the member row, a chat author's avatar…). */
  anchor: HTMLElement | null;
}

let open: readonly OpenProfile[] = [];
const listeners = new Set<() => void>();

function emit(next: readonly OpenProfile[]) {
  open = next;
  for (const l of listeners) l();
}

/**
 * Pops a server member's profile out into a floating window. The windows render inside
 * <MemberList> (always mounted in a server), so any part of the server — a member row, a chat
 * author, a context menu — can open one without owning it.
 */
export function openMemberProfile(userId: string, anchor: HTMLElement | null = null) {
  if (open.some((p) => p.userId === userId)) return;
  emit([...open, { userId, anchor }]);
}

export function closeMemberProfile(userId: string) {
  emit(open.filter((p) => p.userId !== userId));
}

export function useOpenMemberProfiles() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => open,
    () => open,
  );
}
