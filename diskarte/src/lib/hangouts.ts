import type { HangoutTopic } from "@/lib/supabase/database.types";

/** What a hangout is for; the label shows on the hangout bar and in the Home list. */
export const HANGOUT_TOPICS: { id: HangoutTopic; label: string; hint: string }[] = [
  { id: "hangout", label: "Just hanging", hint: "Kwentuhan, no agenda" },
  { id: "gaming", label: "Gaming", hint: "Squad up for a few rounds" },
  { id: "study", label: "Study", hint: "Focus together, quietly" },
  { id: "project", label: "Project", hint: "Plan and get things done" },
  { id: "watch", label: "Watch party", hint: "Watch something together" },
  { id: "create", label: "Create", hint: "Make, draw, write, jam" },
];

export const HANGOUT_DURATIONS = [1, 3, 8] as const;

export function topicLabel(topic: HangoutTopic | null | undefined) {
  return HANGOUT_TOPICS.find((t) => t.id === topic)?.label ?? "Hangout";
}

/** A temporary hangout whose time hasn't run out (kept hangouts are ordinary group DMs). */
export function isLiveHangout(until: string | null | undefined, now = Date.now()): until is string {
  return !!until && Date.parse(until) > now;
}

/** Conversations to list: everything except hangouts whose time is up but haven't been purged yet. */
export function isListedConversation(c: { hangoutUntil?: string | null }, now = Date.now()) {
  return !c.hangoutUntil || Date.parse(c.hangoutUntil) > now;
}

/** "2h 05m left", "12m left", "Ending" (under a minute) or "Ended". */
export function hangoutTimeLeft(until: string, now = Date.now()) {
  const ms = Date.parse(until) - now;
  if (ms <= 0) return "Ended";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "Ending";
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${String(minutes % 60).padStart(2, "0")}m left` : `${minutes}m left`;
}
