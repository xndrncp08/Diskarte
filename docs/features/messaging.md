# Messaging

Text and forum channels inside a Tambayan. DMs share most of this machinery and are covered in
[social.md](social.md#direct-messages-and-group-dms). The delivery pipeline (optimistic sends,
offline queue, recovery) is in [architecture/realtime.md](../architecture/realtime.md).

**Main code:** [`ChatView`](../../diskarte/src/components/chat/ChatView.tsx),
[`Composer`](../../diskarte/src/components/chat/Composer.tsx),
[`MessageItem`](../../diskarte/src/components/chat/MessageItem.tsx),
[`VirtualMessageList`](../../diskarte/src/components/chat/VirtualMessageList.tsx),
[`useChannelChat`](../../diskarte/src/hooks/useChannelChat.ts),
[`actions/messages.ts`](../../diskarte/src/actions/messages.ts),
[`lib/messages.ts`](../../diskarte/src/lib/messages.ts).
**Tables:** `messages`, `reactions`, `message_mentions`, `message_edits`, `polls`, `poll_votes`,
`saved_messages`, `channel_reads`, `scheduled_messages`.

## Sending messages

**What it does.** Posts Markdown text (≤ 4,000 characters), up to 10 attachments, a sticker or a GIF
into a text channel, or a titled post into a forum channel.

**How to use it.** Type in the composer and press Enter (Shift+Enter for a new line). Drafts are kept
per conversation and synced to your account (text only, never files). Mention people with
`@username`; moderators can use `@everyone`, `@here` and `@{Role name}`.

**Behaviour and limits.**

| Rule | Limit | Enforced by |
| --- | --- | --- |
| Length | 4,000 characters (control characters stripped, trimmed) | Zod + `messages_content_check` |
| Not empty | Text, an attachment or a sticker | `messages_not_empty` |
| Rate | 20 / 10 s per user (app), 8 / 10 s per user across channels (database) | `limiters.message`, `messages_before_insert` |
| Slow mode | One message per channel per N seconds; moderators exempt | `messages_before_insert_community` |
| Read-only channels | Moderators only | `messages_read_only_guard` |
| Verification-only channels | Confirmed email/phone required | `messages_before_insert_community` |
| Timeouts | Can read but not send/react/talk | `timeout_send_guard` |
| Server rules | Must be accepted (moderators exempt) | `messages_rules_guard` |
| `@everyone` / `@here` | Only honoured from moderators | `messages_mentions_before_insert` |

Consecutive messages from the same author within 7 minutes are grouped. Times render in Philippine
time on the server and switch to your own time zone after hydration (no hydration mismatch).

**Errors and recovery.** Refused sends show the reason and put your text back in the composer
(slow mode starts a countdown). Network failures keep the message with **Retry** / **Discard**; offline
sends are queued and flush automatically. Auto-mod blocks are silent to the author by design.

**Tests.** `src/hooks/__tests__/useChannelChat.test.tsx`, `src/components/chat/__tests__/chat-ui.test.tsx`,
`tests/db/schema.test.ts`, `tests/db/security.test.ts`, `tests/db/community.test.ts`,
`e2e/server-chat.spec.ts`.

## Markdown rendering

GitHub-flavoured Markdown with highlighted code blocks, spoilers (`||text||`, revealed on click unless
Settings → Chat says "always"), and links limited to `http(s):` / `mailto:` with
`rel="noopener noreferrer nofollow ugc"`. Raw HTML is shown as literal text — it is never parsed
([`MessageMarkdown.tsx`](../../diskarte/src/components/chat/MessageMarkdown.tsx), tests in
`src/components/chat/__tests__/markdown.test.tsx` and `spoilers.test.tsx`).

## Slash commands

Built-in text transforms in the composer ([`lib/slash-commands.ts`](../../diskarte/src/lib/slash-commands.ts));
Tab completes the command name. Unknown commands are sent as typed (so `/r/philippines` still works).

| Command | Result |
| --- | --- |
| `/shrug [text]` | Appends ¯\\\_(ツ)\_/¯ |
| `/tableflip [text]` | Appends (╯°□°)╯︵ ┻━┻ |
| `/unflip [text]` | Appends ┬─┬ノ( º _ ºノ) |
| `/me text` | Italic action text |
| `/spoiler text` | Wraps the text in a spoiler |

There are no bot or app commands.

## Replies and threads

- **Reply**: hover/long-press → Reply, or swipe right on phones. A reply to a message in another
  channel is silently dropped to a plain message.
- **Thread**: start one from any top-level message; it opens in a side panel (full screen on phones,
  [`ThreadPanel`](../../diskarte/src/components/chat/ThreadPanel.tsx)). The root shows "N replies";
  counters are trigger-maintained. Threads can't be nested (`INVALID_THREAD`).

## Forum channels

Every top-level message is a post with a 1–100 character title (`POST_TITLE_REQUIRED` otherwise);
replies go in the post's thread. Pinned posts come first, then latest activity
([`ForumView`](../../diskarte/src/components/chat/ForumView.tsx)). Slow mode, auto-mod, timeouts and
unreads apply.

| Feature | Who | Detail |
| --- | --- | --- |
| Forum kind and tags | Moderators (forum ⚙) | **Discussion** or **Suggestion board**; up to 12 tags, 20 characters, case-insensitively unique (`set_forum_settings`). Removing a tag takes it off every post |
| Tagging a post | Its author or a moderator | Up to 5 of the forum's tags, when posting or from the open post (`set_forum_post`) |
| Solved | Its author or a moderator | Discussion forums only |
| Votes and statuses | Members vote; moderators set statuses | Suggestion boards only (`toggle_forum_vote`); see [suggestion boards](communities.md#suggestion-boards) |
| Filters | Everyone | Search, tag chips, status filter and **Top** sorting |

State lives in `forum_post_state` and `forum_votes` (readable by whoever can view the channel,
written only through the functions, deleted with the post); `forum_overview(channel)` returns tags,
status and vote totals. Migration `20261108020000_forum_tags_suggestions.sql`. Tests:
`tests/db/forum.test.ts`, `tests/db/forum-suggestions.test.ts`, `tests/ui/forum.test.tsx`.

## Reactions

Reactions are glyph codes, not emoji: the Pinoy set (`:petmalu:`, `:lodi:`, `:sana_all:`,
`:charot:`, `:canton:`…), classic reactions, and the server's custom emoji. Up to 20 distinct
reactions per message (`TOO_MANY_REACTIONS`). The right-click menu has a quick row
(`:thumbs_up:`, `:heart:`, `:laugh:`, `:petmalu:`). Settings → Chat can hide reactions.
[`lib/emoji.ts`](../../diskarte/src/lib/emoji.ts), [`ReactionBar`](../../diskarte/src/components/chat/ReactionBar.tsx).

## Attachments and media

- Up to 10 files per message, 10 MB each: JPEG, PNG, WebP, GIF, MP3, MP4, WebM/Ogg/MP4 audio.
- Files are checked by magic bytes in the browser, then by the action, the database trigger and the
  Storage policy. They live in the private `attachments` bucket at
  `<server>/<channel>/<uploader>/<uuid>.<ext>` and are shown through short-lived signed URLs
  ([`useSignedUrls`](../../diskarte/src/hooks/useSignedUrls.ts)).
- Images open in the media viewer with a gallery of the conversation's media
  ([`MediaViewer`](../../diskarte/src/components/chat/MediaViewer.tsx)).
- Low-data mode serves smaller images, doesn't autoplay GIFs and doesn't preload videos.
- Deleting a message also deletes its files (uploader or a moderator).

## Voice messages

Record up to 5 minutes from the composer ([`VoiceRecorder`](../../diskarte/src/components/chat/VoiceRecorder.tsx));
the browser picks WebM/Opus, Ogg/Opus or MP4/AAC (Safari) at 32 kbps. They're uploaded as ordinary
attachments. Test: `src/components/chat/__tests__/voice-recorder.test.tsx`, `tests/db/voice-messages.test.ts`.

## Polls

The composer's poll button creates a message whose text is the question, with 2–10 answers, single
or multiple choice, open for 1 h, 4 h, 8 h, 24 h, 3 days or a week (`create_poll`, `vote_poll`).
Results update live over `db:chat:<channel>:poll-<message>`. Tests: `tests/db/polls.test.ts`,
`tests/ui/polls.test.tsx`.

## Stickers, GIFs and link previews

- **Stickers**: two built-in packs (*Salitang Kanto*, *Tambayan Classics*) drawn as SVG; the database
  stores only the sticker id.
- **GIFs**: GIPHY search via `/api/gifs` (needs `GIPHY_API_KEY`, PG-13). A message that is only a
  GIPHY link renders as the GIF.
- **Link previews**: the first 3 distinct links outside code get a card via `/api/unfurl`
  (SSRF-guarded). Wrapping a link in `<angle brackets>` suppresses its preview; Settings → Chat can
  turn previews off. Test: `src/components/chat/__tests__/link-embeds.test.tsx`,
  `tests/security/unfurl-routes.test.ts`.

## Editing, deleting and pinning

| Action | Who | Notes |
| --- | --- | --- |
| Edit | Author | "(edited)" mark; previous versions kept in `message_edits`, viewable by the author and moderators ([`EditHistory`](../../diskarte/src/components/chat/EditHistory.tsx)) |
| Delete | Author or moderator | Logged in the audit log with an excerpt when a moderator deletes |
| Pin | Moderators | Pins drawer lists them live ([`PinsDrawer`](../../diskarte/src/components/chat/PinsDrawer.tsx)) |

## Scheduled messages

**What.** Text-only messages for text channels, scheduled up to **30 days** ahead, at most **25
pending** per person. **How.** Composer → schedule; the channel's scheduled list shows pending and
failed items with cancel. **Behaviour.** At `send_at` the row is published **as you** by
`publish_scheduled_messages()`, so every live-send rule applies; a refused message stays in the list
with `failed_reason` (timed out, slow mode, lost access, auto-mod). Your open app publishes your own
due messages; the minute cron job publishes everyone's ([background jobs](../architecture/background-jobs.md)).
**Limits.** Not available in DMs; no attachments. **Tests.** `tests/db/scheduled-messages.test.ts`,
`tests/ui/scheduled-messages.test.tsx`.

## Search

| Search | Where | Syntax / filters |
| --- | --- | --- |
| In a Tambayan | Search box in the channel header ([`SearchBox`](../../diskarte/src/components/chat/SearchBox.tsx)) | Words (prefix match), `from:username`, `in:channel`; unknown filters stay as words |
| Everywhere | `/tambayan/search` ([`GlobalSearchView`](../../diskarte/src/components/shell/GlobalSearchView.tsx)) | Words, community (or all communities and DMs), sender username, date range, media type (attachments, images, audio, video) |

Both run `search_messages` / `search_all_messages` with **invoker** rights over `simple`-dictionary
full-text indexes, so RLS keeps private channels, other servers and other people's DMs out. Clicking a
result opens the exact message in context ([`MessageContext`](../../diskarte/src/components/chat/MessageContext.tsx))
without breaking live history. Tests: `tests/db/search.test.ts`, `tests/ui/search.test.tsx`,
`tests/ui/global-search.test.tsx`, `tests/community/search-parse.test.ts`.

## Unreads, mentions and inbox

- Unread pills and red mention counts on channels and the server rail, from `my_unreads()`.
- **Mark Unread** (from a message), **Mark As Read** (a server) and **Mark all as read** (everything,
  including DMs).
- The Activity view (Notification hub) groups Inbox, Mentions and Saved, with channel mention deep
  links ([`NotificationHub`](../../diskarte/src/components/workspace/NotificationHub.tsx)).
- Read receipts are durable and "read up to" a time — see [realtime.md](../architecture/realtime.md#unread-state-and-read-receipts).

Tests: `tests/db/unreads.test.ts`, `tests/db/mark-all-read.test.ts`, `tests/db/notification-read-state.test.ts`,
`tests/ui/unreads.test.tsx`, `src/lib/__tests__/read-receipts.test.ts`.

## Saved and forwarded messages

- **Save Message** bookmarks a message privately (`saved_messages`); you only see it while you can
  still read the channel ([`SavedMessages`](../../diskarte/src/components/workspace/SavedMessages.tsx)).
- **Remind me…** saves the message with a reminder time (20 minutes, 1 or 3 hours, tomorrow 9:00
  or next week; `saved_messages.remind_at`). While Diskarte is open it checks every minute, shows a
  toast with **Open** (and a desktop notification if enabled), then clears the reminder; Saved shows
  pending reminders ([`Reminders.tsx`](../../diskarte/src/components/chat/Reminders.tsx)). Reminders
  that come due while the app is closed appear the next time you open it — there's no push for
  them. Migration `20261108030000_message_reminders.sql`.
- **Forward** posts a quote ("Forwarded from *author* in #channel") to a channel in the same server
  or one of your DMs; attachments are not copied. Tests: `tests/db/saved-messages.test.ts`,
  `tests/ui/forward-saved.test.tsx`.

## Known limitations

- No message translation, bookmarks folders, or message scheduling or reminders in DMs.
- Reminders aren't pushed to closed apps; forum subscriptions ("follow a post") don't exist yet.
- Link preview cache is per server instance (1 hour).
- Search uses the `simple` text configuration: no stemming or Filipino/English-specific language rules.
- Offline, previously loaded conversations aren't available; only sending is queued.
