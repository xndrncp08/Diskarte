import type { ForumStatus } from "@/lib/supabase/database.types";

export type ForumMode = "discussion" | "suggestions";

export const FORUM_STATUS_LABEL: Record<ForumStatus, string> = {
  solved: "Solved",
  under_consideration: "Under consideration",
  planned: "Planned",
  in_progress: "In progress",
  completed: "Completed",
  declined: "Declined",
};

/** Statuses moderators move suggestions through, in order. */
export const SUGGESTION_STATUSES: ForumStatus[] = ["under_consideration", "planned", "in_progress", "completed", "declined"];

export interface PostState {
  tags: string[];
  status: ForumStatus | null;
  votes: number;
  voted: boolean;
}

export const NO_STATE: PostState = { tags: [], status: null, votes: 0, voted: false };

/** Pinned first, then most votes (suggestion boards, "top") or latest activity. */
export function sortPosts<T extends { id: string; pinned?: boolean | null }>(posts: T[], activity: (post: T) => number, state: (id: string) => PostState, top: boolean) {
  return [...posts].sort(
    (a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (top ? state(b.id).votes - state(a.id).votes : 0) || activity(b) - activity(a),
  );
}
