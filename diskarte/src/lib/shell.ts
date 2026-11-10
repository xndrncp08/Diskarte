/**
 * Which app shell this browser uses: Classic (today's UI, the default) or Pulse (the redesign, opt-in).
 * Saved in a cookie so the root layout renders `<html data-shell>` on the first byte, like the theme.
 */
export const SHELLS = ["classic", "pulse"] as const;
export type Shell = (typeof SHELLS)[number];

export const SHELL_COOKIE = "diskarte-shell";
export const SHELL_MAX_AGE = 31536000;

/** Anything but an exact "pulse" (missing, stale, tampered) falls back to Classic. */
export function parseShell(value: unknown): Shell {
  return value === "pulse" ? "pulse" : "classic";
}

/**
 * The shell the server renders while Pulse is a super-admin preview: the cookie counts only for a super admin
 * (the role the server verified), so nobody else can opt in by setting it by hand.
 */
export function previewShell(value: unknown, platformRole: string): Shell {
  return platformRole === "super_admin" ? parseShell(value) : "classic";
}

/**
 * Switch shells in place. The attribute flips the CSS immediately; `router.refresh()` re-renders the
 * Server Components with the new cookie while client state (the LiveKit call in SessionProviders,
 * open chats, drafts) stays mounted. Never reload the page here: that would drop a live call.
 */
export function setShell(shell: Shell, router: { refresh(): void }) {
  document.documentElement.dataset.shell = shell;
  document.cookie = `${SHELL_COOKIE}=${shell}; path=/; max-age=${SHELL_MAX_AGE}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
  router.refresh();
}
