/**
 * Contextual Help Center links used inside the app. Paths point at published /docs pages and
 * anchors; tests/docs fails if one stops existing, so headings can't be renamed out from under them.
 */
export const HELP = {
  home: "/docs",
  account: "/docs/help/sign-in",
  devices: "/docs/help/sign-in#keep-your-account-safe",
  privacy: "/docs/guides/notifications-and-privacy#privacy",
  appearance: "/docs/features/account-and-settings",
  accessibility: "/docs/developers/design-system#accessibility",
  voice: "/docs/help/connection#voice-or-video-problems",
  chat: "/docs/guides/messages",
  notifications: "/docs/help/notifications",
  advanced: "/docs/help/connection",
  language: "/docs/help/faq#can-i-use-diskarte-in-filipino",
  storage: "/docs/help/mobile-app",
  keybinds: "/docs/getting-started/account-and-install#find-your-way-around",
  report: "/docs/help/report-a-problem",
  profile: "/docs/getting-started/account-and-install#customize-your-profile",
  signIn: "/docs/help/sign-in",
  community: "/docs/guides/tambayans#run-your-community",
  roles: "/docs/guides/tambayans#roles-and-helpers",
  moderation: "/docs/guides/tambayans#keep-it-safe",
  calls: "/docs/guides/calls",
  workspace: "/docs/guides/workspace",
  channels: "/docs/guides/tambayans#set-up-channels",
  install: "/docs/help/mobile-app",
} as const;

export type HelpTopic = keyof typeof HELP;
