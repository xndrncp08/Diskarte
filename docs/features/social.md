# Friends, DMs and profiles

**Main code:** [`SocialProvider`](../../diskarte/src/components/providers/SocialProvider.tsx) (one
app-wide subscription to friendships and conversations), [`useSocial`](../../diskarte/src/hooks/useSocial.ts),
[`FriendsView`](../../diskarte/src/components/social/FriendsView.tsx),
[`DmView`](../../diskarte/src/components/social/DmView.tsx),
[`useDirectChat`](../../diskarte/src/hooks/useDirectChat.ts),
[`actions/social.ts`](../../diskarte/src/actions/social.ts), [`lib/social.ts`](../../diskarte/src/lib/social.ts).
**Tables:** `profiles`, `friendships`, `user_blocks`, `privacy_settings`, `friend_nicknames`,
`friend_favourites`, `user_notes`, `dm_conversations`, `dm_participants`, `direct_messages`,
`moments`, `moment_mutes`, `call_rings`.

## Profiles

**What.** Display name, unique `@username` (3–32 of `a–z 0–9 _ .`, lower-cased), avatar (a recoloured
salakot mascot preset or an uploaded image), banner (preset or image), bio, presence and custom status.
**Where.** Settings → My Profile ([`ProfileBuilder`](../../diskarte/src/components/profile/ProfileBuilder.tsx));
others see a popout card ([`ProfileCard`](../../diskarte/src/components/profile/ProfileCard.tsx)) from
member lists, messages and context menus. On someone else's card: mutual friends, shared Tambayans
(Diskarte HQ excluded), their level in this Tambayan if levels are on, badges, and your private note.
**Data.** Any signed-in user can read profiles; you can only update your own row. Uploaded images go
to the public `avatars` bucket under your user id; image URLs must be `https://` without quotes or
parentheses.

### Presence and custom status

| Control | Behaviour |
| --- | --- |
| Status | Online, Idle, Do Not Disturb, Invisible (`presence_status`), shown as a pixel ring and roster dot |
| Filipino status triggers | One click sets text + matching presence, e.g. "Nagluto ng Canton" (idle), "AFK / Tulog" (idle), "LFG / Pa-carry" (online), "Nag-aaral pa boffum" (DND), "Nasa jeep, mahina signal", "Brownout / Bumabagyo" |
| Clear after | 30 min, 1 h, 4 h, 24 h or never. Your open app clears it on time; the cron job clears it for people who are offline |

Super admins can override someone's status from the Control Center (audited).
Tests: `tests/db/profile-connections.test.ts`, `src/lib/__tests__/profile.test.ts`,
`tests/ui/StatusHighlight.test.tsx`.

## Friends

**How.** Friends tab → **Add Friend** by `@username`, or Add Friend on a profile card / person menu.
Requests appear as incoming/outgoing; accept, decline or cancel.
**Rules (database).** The recipient's Settings → Privacy & Safety decides who may send requests:
everyone, people who share a Tambayan with them (Diskarte HQ doesn't count), or nobody. Blocks hide
everything both ways — to the blocked person a block looks like "user not found".
**Extras.**

| Feature | Visibility |
| --- | --- |
| Favourites | Private to you; favourites are listed first and can be a Moments audience |
| Friend nicknames | Private name shown only to you in friends and DMs |
| Server nicknames | `members.nickname`, visible to the whole Tambayan |
| Notes | Private note about anyone (`user_notes`) |

Tests: `tests/db/friend-nicknames.test.ts`, `tests/db/user-notes.test.ts`, `tests/db/privacy.test.ts`,
`tests/db/community.test.ts` (friendships, blocks), `tests/ui/ContextMenus.test.tsx`.

## Direct messages and group DMs

**What.** 1:1 and group conversations (3–10 people) with the same composer as channels: Markdown,
replies, edits, deletes, stickers, GIFs, voice messages and private media.
**How.** Message button on a friend's card or the Messages tab; **New group DM** picks 2–9 friends.
Right-click a DM for mark read, the person's menu or leave (groups).

| Rule | Detail |
| --- | --- |
| Who can start | 1:1: accepted friends with no block either way (`open_dm`). Groups: every invitee must be your friend and not blocked (`create_group_dm`, `add_to_group_dm` → `DM_NOT_ALLOWED`) |
| Size | 10 participants (`INVALID_GROUP_SIZE`) |
| One 1:1 per pair | `dm_conversations.direct_key` is unique |
| Reading | Participants only (`is_dm_participant`), including Realtime `db:dm:<id>` |
| Editing / deleting | Author only |
| Rate | 8 messages / 10 s per user |
| Media | Private `attachments` bucket under `dm/<conversation>/<uploader>/…`, readable only by participants |
| Blocking | Ends the ability to message in that conversation |

**Read receipts.** Under your latest message: **Sent** or **Seen** (with names in groups), from
`dm_participants.last_read_at`, which fellow participants can read. There is no opt-out yet.

**Calls.** The call button rings everyone else in the conversation for 45 s; see
[voice-and-video.md](voice-and-video.md).

**Invitations.** The Invite dialog can send a Tambayan invite as a DM; it renders as an invite card
(`direct_messages.invite_server_id`).

**Notifications.** Unread dots, a sound, an optional desktop notification
([`DmNotifier`](../../diskarte/src/components/shell/DmNotifier.tsx)) and Web Push when configured.

Tests: `tests/db/dm-attachments.test.ts`, `tests/ui/dm-notifier.test.tsx`, `e2e/server-chat.spec.ts`.

## Instant Hangouts

**What.** A temporary space for right now: text chat plus the DM call room (voice, video, screen
share, soundboard and activities such as watch party), for you and 1–9 friends, lasting 1, 3 or 8
hours. **How.** Home → **Start a Hangout** (or the button in the Home sidebar, or the ✦ next to a
friend on Home) → what it's for (Just hanging, Gaming, Study, Project, Watch party, Create) → who →
how long → optionally **Jump into voice**, which joins the call and rings everyone picked.

| Rule | Detail |
| --- | --- |
| What it is | A group conversation (`dm_conversations.kind = 'group'`) with `hangout_until` and `hangout_topic` set; created by `create_hangout` |
| Who | Accepted friends with no block either way (`DM_NOT_ALLOWED`); 2–10 people including you |
| How many | 3 live hangouts hosted at once per person (`RATE_LIMITED`) |
| Extend | Any participant: **+1 hour** (`extend_hangout`), never more than 24 hours from now |
| Keep | The host: **Keep** clears the end time; it becomes an ordinary group DM |
| Make it a Tambayan | The host: creates a Tambayan from the matching template and posts its invite in the hangout |
| End | The host: **End** deletes the conversation and its messages for everyone (`end_hangout`) |
| Time's up | Sending stops (`HANGOUT_ENDED`), it leaves everyone's lists, and `purge_expired_hangouts` deletes it (run by the platform job and whenever someone starts a hangout) |
| Files | Not while temporary (`can_upload_dm_attachment` is false), so a purge never leaves files behind; GIFs, stickers and links work |

Code: [`Hangouts.tsx`](../../diskarte/src/components/social/Hangouts.tsx),
[`lib/hangouts.ts`](../../diskarte/src/lib/hangouts.ts), actions in
[`actions/social.ts`](../../diskarte/src/actions/social.ts). Migration `20261108000000_hangouts.sql`.
Tests: `tests/db/hangouts.test.ts`, `tests/ui/hangouts.test.tsx`, `src/lib/__tests__/hangouts.test.ts`.

## Friends who are around

Home's **Instant Hangouts** card and **Your people** list show friends who are online now, online
first, with their status and — when you can see that channel yourself — the voice channel they're
in. Data comes from `friends_activity()`: accepted, unblocked friends with a device heartbeat in the
last 2 minutes, polled once a minute while the tab is visible
([`useFriendsActivity`](../../diskarte/src/hooks/useFriendsActivity.ts)).

- **Invisible** friends never appear.
- **Settings → Privacy → Show friends when I'm around** (`privacy_settings.share_activity`) hides you
  from everyone's feed.
- A voice channel is only revealed if `can_view_channel` is true for the viewer, so private
  channels and Tambayans you're not in stay private.

## Moments

**What.** Optional 24-hour updates on Home — text and/or one photo — for **all friends** or
**favourites only**. **How.** Home → Moments → post; view, mute a person, report or delete your own.
**Limits.** 10 live moments per person; photos ≤ 5 MB in the private `moments` bucket.
**Permissions.** Viewers must be friends (and a favourite of the author for favourites-only);
muted authors are hidden; expired moments disappear for viewers immediately while the author can
still see and delete them. Reports go to the Control Center's Reports tab.
**Retention.** Rows are purged by the platform job a day after expiry; the photo of a purged moment
stays in Storage until the author deletes their account (documented shortcut).
Code: [`Moments.tsx`](../../diskarte/src/components/social/Moments.tsx). Tests:
`tests/db/moments.test.ts`, `tests/ui/moments.test.tsx`.

## Known limitations

- No read-receipt or typing-indicator opt-out.
- Hangouts have no shared notes or task boards (the Tambayan workspace has them) and no files while temporary.
- "Around now" is heartbeat-based (up to ~2 minutes behind) and per device, not per tab.
- No message requests from non-friends; DMs are friends-only by design.
- Group DMs have no roles, ownership transfer UI or custom icons.
- Moments have no reactions or replies.
