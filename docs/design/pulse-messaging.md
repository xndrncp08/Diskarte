# Pulse messaging

How messages, the composer, DMs, forums and threads look and behave inside the [Pulse shell](pulse-shell.md)
(direction "Canvas"). Classic renders exactly as before: every piece below is a `useShellKind() === "pulse"` branch
inside the existing component, sharing all data, hooks and actions.

| Component | Pulse path |
| --- | --- |
| [`MessageItem`](../../diskarte/src/components/chat/MessageItem.tsx) | Margin transcript row, inline action row, long-press Sheet |
| [`ChatView`](../../diskarte/src/components/chat/ChatView.tsx), [`DmView`](../../diskarte/src/components/social/DmView.tsx) | Day dates, the New line, roving focus; DmView also uses the `Masthead` |
| [`ThreadPanel`](../../diskarte/src/components/chat/ThreadPanel.tsx) | Pulse header and surface, same transcript and dock |
| [`ForumView`](../../diskarte/src/components/chat/ForumView.tsx) | Pulse search field, chips, votes and post cards; statuses in words |
| [`Composer`](../../diskarte/src/components/chat/Composer.tsx) | The compose dock |
| [`ReactionBar`](../../diskarte/src/components/chat/ReactionBar.tsx), [`EditedMark`](../../diskarte/src/components/chat/EditHistory.tsx) | Compact chips, "Edited" label |
| [`Transcript.tsx`](../../diskarte/src/components/chat/Transcript.tsx) | `DaySeparator`, `UnreadLine`, `useReadPosition` |
| [`useMessageRoving`](../../diskarte/src/hooks/useMessageRoving.ts) | The log's keyboard model |

## Transcript

- **Margin:** each row is a two-column grid: a right-aligned margin (6.5rem from tablets up, 4.5rem on phones, where
  long names wrap to two lines) with the author's name and time, and the content column (capped at 72ch). No avatar:
  the name is the anchor. A message within 7 minutes of the same author's previous one (`isGroupedWithPrevious`)
  shares the margin: no repeated name, the time appears on hover or focus. Header rows get more space above them
  (12 px on phones, 16 px from tablets up) so a group reads as one block. The New line breaks a group (`sharesMargin`).
- **Accessible name:** "Name (mentions you), 3:42 PM: preview", with the preview as plain text (`previewText`, 140
  characters; "Sticker" or "Attachment" when there's no text), never raw markdown.
- **Text:** Figtree at `pulse-body` with a 1.55 line height. Links in accent ink, code on `--pulse-code` in the mono
  font (paper mode swaps the highlight colours for darker ones that reach 4.5:1).
- **Labels:** Edited and Pinned are small outlined caption labels, in words. Webhook and Official posts get a label
  in the margin.
- **Mentions of you:** the mention tint plus a 3 px alert edge (shape) and "(mentions you)" in the row's accessible
  name, never colour alone.
- **Day separators:** a quiet editorial date (Bricolage, muted) with a hairline.
- **New line:** the sun `PulseLine` labelled "New · 3:42 PM" above the first message someone else sent after your
  read position (`firstUnreadIndex`). `useReadPosition` snapshots the read position when the conversation opens (or
  when the unread counts first arrive) and keeps the line in place while you read; it only moves back (Mark
  Unread). Nothing unread on open, no line. Channels read `UnreadsProvider`'s `readAt`; Pulse waits for those counts
  before marking the channel read, so a fresh load still knows. DMs read `SocialProvider`'s `lastReadAt`.
- **Reply quote:** a "ticket stub": a raised tab with a dashed top edge, the author's name and a preview; it jumps
  to the original.
- **Reactions:** compact chips (icon and count). Yours: accent tint, accent edge and bold count. The press scale
  runs only under `pulse-motion`.
- **Attachments, link previews, voice notes:** `.chat-card` raised cards on the line token.
- **Receipts (DMs):** "Sent" / "Seen" as a caption under your last message.

## Actions

- **No floating toolbar.** An inline action row under the content: **Reply**, **React** (the emoji picker),
  **Thread** (channels) and **More…** (the message's context menu, the same `MessageMenuItems` as right-click,
  opened with `useContextMenu().openFrom`). It is a Pulse `Toolbar` (one Tab stop, arrow keys).
- **When it shows** (`pulse.css`): on keyboard focus; while one of its popups is open; and once opened
  (`data-actions="open"`, by Enter or the margin button) until focus moves to another message or leaves the log.
  **Never on hover alone**: the row takes space, and revealing it under the pointer would push the log around.
- **Pointer:** hovering a message shows one quiet **Message actions** button (…, 24 px) at the left edge of its
  margin (tablets up; the margin reserves room for it). Clicking it opens the row and focuses Reply. It is
  `tabIndex=-1`: keyboard users reach the row with Enter.
- **Touch:** long-press (the existing `useContextMenu` gesture) opens the actions in a bottom `Sheet` instead of a
  floating menu; swipe to reply is unchanged.

## Keyboard

| Keys | Where | Does |
| --- | --- | --- |
| Tab | Into the log | Lands on the last focused message, else the newest. The log is one Tab stop |
| ↑ / ↓, Home / End | A message | Previous / next message, first / last loaded (scrolls a virtualized row in first) |
| Enter or → | A message | Into its action row (Reply first) |
| ← / → | Action row | Between actions |
| Escape | Action row | Back to the message |
| Tab / Shift+Tab | A message | Leaves the log |
| Shift F10, Menu key | A message | Its context menu |

Enter lands on **Reply**, so Enter twice replies to the message. Inside the row, Tab past the last action leaves the
log, and **Shift+Tab** from the first action (Reply) goes back to the message, not to the previous message's
controls. While focus is anywhere in the log its live region is switched off (`aria-live="off"`), so new messages
aren't read out over the one you're on; it goes back to `polite` when focus leaves. The typing line above the dock is
not a live region either: it changes too often to announce.

`VirtualMessageList` takes the roving handlers through its `roving` prop; the scroller itself becomes focusable only
while the tab-stop message is scrolled out of the DOM, and hands focus to it. Rows stay plain DOM (no framer-motion).

## Compose dock

- A raised card (`rounded-pulse-card`, `shadow-pulse-2`) a little above the bottom edge: the field on top (16 px on
  phones so iOS doesn't zoom, `pulse-body` from tablets up), the tools underneath (Attach, Voice note, GIF, Emoji,
  Sticker, Poll, Schedule, each where it existed before; the GIF, emoji and sticker pickers take a Pulse
  `triggerClassName`), slow mode and the character count, then **Send** as the
  sun pill with an Enter key hint (`Kbd`, hidden on phones).
- Above the dock: the typing line (words first; the dots only move under `pulse-motion`) and the reply ticket stub
  with Cancel reply.
- Everything else is the Classic composer's logic, unchanged: drafts and their sync notice, slash commands (Tab to
  complete), mention requests, uploads and their gates (`uploads={false}` in Hangouts), drag and drop, paste,
  slow mode, locks (a Pulse notice card), the offline queue, scheduling, Enter / Shift+Enter, ↑ to edit your last
  message, Escape to cancel a reply. The keyboard-safe height comes from the shell's `useAppViewport`, as in Classic.

## DMs, threads and forums

- **DMs:** the `Masthead` (name, "Direct message" / "Group" / "Hangout", calls, Leave group), the transcript with
  the New line and receipts, the dock.
- **Threads:** a Pulse surface with a header ("Thread in #room", the root's preview, Close), the root message, the
  replies with roving focus, the dock.
- **Forums:** the search field, filter chips, votes and post cards on Pulse tokens; a post's status is a word on an
  outlined chip with a coloured mark.

## Tests

- `tests/ui/pulse-messaging.test.tsx`: grouping and the New line (`firstUnreadIndex`, `sharesMargin`,
  `useReadPosition`), the roving keyboard model (`logIndex`, Tab in and out, Enter, Escape), the action row's
  names and tab stop, More… opening the message menu, mentions and the reply stub in words, Classic unchanged, and
  the dock keeping Enter / Shift+Enter / ↑ / Escape, the tools, slow mode, the upload gate and the lock notice.
- `tests/browser/pulse-messaging.spec.ts`: axe (WCAG 2.2 AA) in dark and light at 390 and 1280 px on the channel,
  DM, forum and thread, no horizontal overflow, the keyboard path through the log, and screenshots in
  `test-results/pulse-messaging-*.png`. Fixtures: `tests/browser/pulse-messaging-data.ts`.

```sh
cd diskarte && CI=1 npx playwright test --config playwright.experience.config.ts pulse-messaging
```

## Not yet

- The pickers' panels (GIF, sticker, emoji, poll, schedule) keep their Classic look, readable through the Classic
  bridge; the voice, poll and schedule triggers too.
- No avatars in the margin; a per-user preference could add small ones later.
- Forum post bodies open in the thread panel as before; the forum has no Pulse empty-state illustration.
