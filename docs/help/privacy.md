# Privacy and your data

What Diskarte stores, who can see it, and how to get it or delete it — in plain language. This page
describes how the software and the official instance work today; it is not a legal agreement.
Diskarte is open source, so anyone can run their own server: a self-hosted Diskarte is run by its
own operators, who decide their own policies.

## What we store

| Data | Why | Who can see it |
| --- | --- | --- |
| Email, username, display name, password | To sign you in. Passwords are stored as one-way hashes by the sign-in service | You. Platform administrators can see your email |
| Profile: avatar, banner, bio, status | So people recognise you | Anyone signed in |
| Messages, reactions, attachments, voice messages, polls | The conversations you take part in | Members of that Tambayan or channel; for DMs, only the people in the conversation |
| Moments | Short updates for friends | Your friends, or only your favourites; they disappear after 24 hours |
| Friends, blocks, nicknames, notes, favourites | Your social settings | Friend lists are visible to the two people involved; nicknames, notes, favourites and blocks only to you |
| Sessions and devices | Security: you can sign out other devices; administrators can stop abuse | You; platform administrators (a device label and a scrambled fingerprint, never raw browser details) |
| Problem reports | To fix what's broken | You and platform administrators; includes the page you were on and your browser type |
| Push notification registration | To deliver notifications to a device you turned on | Never shown to anyone; previews are off by default |

## What we don't do

- No ads, and no selling or sharing your data for advertising.
- No AI features: your messages aren't analysed, summarised or used to train anything.
- Voice and video calls aren't recorded. Audio and video travel through a media server (LiveKit) to
  the other people in the call; they are encrypted on the way, but not end-to-end.
- Messages are protected by access rules on the server and encrypted in transit; they are **not**
  end-to-end encrypted, so the service operators could technically access them.

## Services that handle your data

| Service | What for |
| --- | --- |
| Supabase | Database, sign-in, file storage and realtime updates |
| Vercel | Runs the website and app; Vercel Web Analytics counts page views without cookies |
| LiveKit Cloud | Relays voice, video and screen sharing |
| GIPHY | GIF search (your search terms go to GIPHY through our server; GIFs you view load from GIPHY) |
| Your browser's push service (Apple, Google, Mozilla) | Delivers notifications you turned on, as encrypted messages |

Diskarte also counts visits itself: a random number stored in your browser is counted once per day,
with no IP address or account attached. When you post a link, our server fetches the page to build
the preview, so the linked site sees our server, not you.

## Who else can see things

- **Tambayan moderators and admins** can see their Tambayan's audit log, which includes short
  excerpts of messages they delete, and moderation actions.
- **Platform administrators** (the Diskarte team) can see account emails, sessions and devices, and
  can ban accounts or revoke sessions. Their actions are logged.

## How long we keep it

- Messages, profiles and community data stay until you or a moderator delete them, or you delete your
  account.
- Moments disappear for viewers after 24 hours and are removed from the database a day later. A
  removed Moment's photo currently stays in storage until you delete your account.
- Notification delivery records are kept for 7 days.

## Your choices

- **Download your data:** Settings → Storage & Data → **Request all of my data**.
- **Delete your account:** Settings → My Account → **Danger zone**. Your files and private data are
  deleted; messages with attachments are deleted; other messages you sent remain without your name.
  Tambayans you own pass to their most senior member, or are deleted if nobody else is in them.
- **Control who reaches you:** Settings → Privacy & Safety, blocking, and notification settings.
- **Turn off notification previews** (they start off): Settings → Notifications.

## Questions or concerns

[Report a problem](report-a-problem.md) from the app, or open an issue on the project's GitHub. Report
security problems privately using the [security policy](../../SECURITY.md).
