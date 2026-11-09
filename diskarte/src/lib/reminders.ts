/** "Remind me" choices, computed from the moment you pick one. */
export const REMINDER_OPTIONS: { id: string; label: string; at: (now: Date) => Date }[] = [
  { id: "20m", label: "In 20 minutes", at: (now) => new Date(now.getTime() + 20 * 60_000) },
  { id: "1h", label: "In 1 hour", at: (now) => new Date(now.getTime() + 3600_000) },
  { id: "3h", label: "In 3 hours", at: (now) => new Date(now.getTime() + 3 * 3600_000) },
  { id: "tomorrow", label: "Tomorrow at 9:00", at: (now) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9) },
  { id: "week", label: "Next week", at: (now) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 9) },
];

/** How often the open app checks for due reminders (background tabs are throttled to about this anyway). */
export const REMINDER_POLL_MS = 60_000;
