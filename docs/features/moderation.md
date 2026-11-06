# Moderation and administration

Two levels: **Bantay-Bayan** tools inside each Tambayan (for its moderators and admins), and the
**Super Admin Control Center** for the whole platform.

## Bantay-Bayan (per Tambayan)

**Main code:** [`actions/moderation.ts`](../../diskarte/src/actions/moderation.ts),
[`actions/voice.ts`](../../diskarte/src/actions/voice.ts), settings panels in
[`components/server/settings/`](../../diskarte/src/components/server/settings),
[`PersonMenu`](../../diskarte/src/components/social/PersonMenu.tsx) (right-click on a member).
**Tables:** `audit_logs`, `server_bans`, `member_warnings`, `members.timeout_until`, `servers.automod_*`,
`channels.slowmode_seconds/requires_verification/read_only`.

### Auto-mod

Server settings → **Bantay-Bayan** (admins): a master switch, built-in categories and custom blocked
words. Runs **inside the database** on every message insert (`messages_before_insert_community` →
`automod_match`), so it can't be bypassed.

| Category | Catches |
| --- | --- |
| Spam & flooding | Repeated messages (the same text 3 times in a minute), mass mentions, "free nitro" and get-rich-quick scams |
| Phishing links | Fake GCash/Maya/bank/Discord/Steam links, IP loggers, lookalike (punycode) domains |
| Hate speech | Slurs targeting race, gender and disability |
| Explicit content | Porn sites and sexual terms (English and Tagalog) |
| Custom words | Admin's list, matched after leetspeak normalisation |

Moderators are exempt. A blocked message is **dropped silently** (the insert returns no row) and an
`automod.block` entry with a 200-character excerpt is written to the audit log; raising an error
would roll the audit entry back. Phishing links are also refused in DMs.

### Channel controls

| Control | Options | Who |
| --- | --- | --- |
| Slow mode | Off, 5 s, 10 s, 30 s, 1 m, 5 m, 15 m, 1 h, 6 h | Moderators set; moderators exempt |
| Read-only | Only moderators post | Moderators |
| Verified accounts only | Confirmed email/phone needed to post | Moderators |
| Private | Visible to admins + granted members/roles | Admins only |

### Member actions

All require outranking the target (the owner outranks everyone; admins and the owner can't be timed
out).

| Action | Effect | Audit action |
| --- | --- | --- |
| Timeout | 60 s, 5 min, 10 min, 1 h, 1 day or 1 week: can read but not send, react or join voice | `member.timeout`, `member.timeout_remove` |
| Warn | A note shown to the member once ([`WarningNotice`](../../diskarte/src/components/server/WarningNotice.tsx), live); moderators see the history | `member.warn` |
| Kick | Removes membership | `member.kick` |
| Ban (with reason) | Removes membership and refuses rejoining via any invite or Explore | `member.ban`, `member.unban` |
| Change rank | Admins only; owner-only for demoting admins | `member.role_update` |
| Server nickname | Self, or moderators for lower ranks | — |

### Voice moderation

Right-click someone in a voice channel: **Server Mute / Unmute**, **Server Deafen / Undeafen**,
**Disconnect**, **Move to** another (non-private) voice channel. Implemented through LiveKit's server
API; see [architecture](../architecture/voice-and-video.md#voice-moderation).

### Audit log

Server settings → **Audit log** (moderators and up). Written only by definer functions/triggers
(`log_audit()` isn't callable by clients). Recorded actions:

`member.join`, `member.leave`, `member.kick`, `member.ban`, `member.unban`, `member.timeout`,
`member.timeout_remove`, `member.warn`, `member.role_update`, `message.delete` (with excerpt),
`automod.block`, `channel.create`, `channel.update`, `channel.delete`, `server.update`,
`server.transfer`, `invite.regenerate`, `badge.grant`, `badge.revoke`, `soundboard.add`,
`soundboard.remove`, `lfg.close`, `webhook.create`, `webhook.rotate`, `workspace.create`,
`workspace.delete`.

Tests: `tests/db/community.test.ts`, `tests/db/timeouts.test.ts`, `tests/db/security.test.ts`,
`tests/community/actions.test.ts`, `e2e/community.spec.ts`.

## Problem reports

Anyone signed in can use Settings → **Report a problem** (categories: something's broken, it's slow
or laggy, account or sign-in, something else). The current page and browser are attached. The
database allows 5 reports per hour per person. Reporters see their own reports; super admins triage
them in the Control Center (open → escalated / resolved / dismissed, with an optional issue link).
Moments reports land in the same tab. Triage is manual — the automated issue/agent workflow that
earlier versions mentioned was removed. Tests: `tests/db/problem-reports.test.ts`,
`tests/components/ReportProblemForm.test.tsx`.

## Super Admin Control Center

**Access.** `/admin` (and `/tambayan/admin` on phones) for platform `super_admin`s only. Checked by
the proxy (`is_super_admin()` before rendering), the page, every Server Action and every `admin_*`
RPC; the Control Center code is only downloaded by super admins. On tablets and up it opens as a
panel in the workspace; on phones it's a full page.

**Main code:** [`components/admin/`](../../diskarte/src/components/admin),
[`actions/admin.ts`](../../diskarte/src/actions/admin.ts),
[`/api/admin/snapshot`](../reference/api.md#get-apiadminsnapshot),
[`20261006000000_admin_control_center.sql`](../../supabase/migrations/20261006000000_admin_control_center.sql).

| Tab | What it shows / does |
| --- | --- |
| **Network** | Every account with live presence, LiveKit connection, devices (hashed fingerprint + label), sessions and last activity; instant filters and server-side search by username, display name or email. The user inspector changes platform role, overrides status, revokes sessions, bans/unbans |
| **Traffic** | Unique browsers per Manila day from `site_visits` (no IPs or user ids) |
| **Voice** | Live LiveKit rooms across the network, who is connected, mic state, call length |
| **Broadcast** | The Global Announcement Dispatcher: Markdown with headers, callouts (`> [!INFO]`, `[!SUCCESS]`, `[!WARNING]`, `[!CRITICAL]`) and code blocks, preview, post to Diskarte HQ `#announcements` and/or `#global-lounge`; optionally sticky (a banner on every canvas for N hours); retract |
| **Reports** | Problem reports triage |
| **Audit** | `admin_audit_logs`: every role change, status override, revocation, ban and broadcast |

**Platform roles.** `super_admin` or `moderator` in `platform_admins` (no row = standard member),
mirrored into Diskarte HQ as admin/moderator. The first super admin is granted with
`npm run admin:grant`; afterwards roles change only in the Control Center, and nobody can change
their own role.

**Platform bans and revocations.** A ban sets `auth.users.banned_until`, deletes the account's
sessions and is enforced by restrictive RLS on messages and DMs; open canvases sign out within
seconds. Super admins can't ban themselves or other super admins.

Tests: `tests/db/admin-control-center.test.ts`, `tests/admin/*.test.ts(x)`,
`tests/auth/account-gates.test.ts`, `e2e/admin.spec.ts`.

## Known limitations

- No message reporting inside Tambayans (only Moments and problem reports); moderators act on what
  they see.
- No automated or AI moderation beyond the rule-based auto-mod.
- Audit logs are not exported or retained on a schedule; they are kept indefinitely.
- No appeal workflow for bans.
