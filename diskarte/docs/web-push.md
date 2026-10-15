# Web Push delivery

Diskarte uses browser Push/Notifications APIs, its existing `/sw.js`, the `web-push` VAPID transport, and a private Supabase outbox. No Firebase project, native app, open tab or polling browser is required. On iOS/iPadOS 16.4+, install the Home Screen app before enabling notifications. Android and desktop support depends on the browser. OS Focus, notification settings, connectivity, browser shutdown policies and battery restrictions still govern delivery.

**Current production status: configuration and physical-device delivery are unverified.** The repository does not contain production VAPID/service-role credentials. Applying a migration in tests does not apply it to the hosted project.

## Deployment order

1. Back up the database using the existing release/restore procedure, review pending migrations, and test them against staging. Apply all `supabase/migrations` in filename order, including `20261015000000_web_push.sql`. It is additive and defaults push delivery to disabled. Never reset the production database. `npm run db:check` checks object existence with the public key; it does not validate live delivery.
2. Generate a **stable** VAPID pair once, from the app directory:

   ```sh
   node -e 'console.log(require("web-push").generateVAPIDKeys())'
   node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64url"))'
   ```

   Save the outputs in a secret manager. Do not commit them or paste them into logs/tickets. Rotating the VAPID pair requires users to reconnect devices; routine deployments must retain the same pair.
3. Set these **runtime** environment variables on your host (Vercel or Render): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (a real `mailto:` operator contact or HTTPS contact URL), `PUSH_DISPATCH_SECRET` (the random value, at least 32 characters), and `SUPABASE_SERVICE_ROLE_KEY`. Keep existing Supabase, LiveKit and `SITE_URL` settings. No private value may use a `NEXT_PUBLIC_` prefix. The setup API returns only the public VAPID key. Missing push settings disable setup without preventing the rest of Diskarte from starting. The Next.js dispatcher runs on either host; no additional push provider is required.
4. In Supabase Vault, create `diskarte_push_url` with the exact `https://YOUR_SITE/api/push/dispatch` URL and `diskarte_push_secret` with the matching dispatcher secret. Do not point it at a redirect, old deployment or untrusted host.
5. As database owner, review and run [`sql/enable-web-push.sql`](sql/enable-web-push.sql). It enables `pg_net`/`pg_cron`, validates Vault settings, installs the transactional wake trigger and named minute recovery job, and enables delivery. Re-running it replaces its functions/trigger and updates the named cron job. Database extensions and Vault are deployment dependencies, kept out of the portable core migration. A successful SQL run confirms configuration syntax, **not HTTP or phone delivery**.
6. Verify the wake requests and dispatcher logs. `pg_net` starts HTTP requests after the message transaction commits. A wake is coalesced once per transaction; a full dispatcher batch schedules the next drain. The minute cron only recovers due work and creates RSVP reminders. It does **not** make HTTP requests while the queue is idle. Render free-service cold starts can delay delivery; latency-sensitive deployments need capacity that meets their latency target. No immediate delivery guarantee is made for a sleeping host.
7. Open Settings → Notifications in a supported browser/installed app, enable this device, wait for preference sync, then send a test. “Queued” and “push service accepted” are different from observed device delivery. Complete the physical-device checklist below before declaring production acceptance.

## Vercel production setup

Use the Next.js project rooted at `diskarte/` with its own lockfile (`npm ci`, `npm run build`). In Vercel's project environment variables, set the five push values above for **Production**, and set `SITE_URL=https://diskarte-ten.vercel.app`. Redeploy after saving them; existing deployments do not receive changed environment variables. Keep the VAPID pair stable and keep private values server-only.

Supabase Vault is separate from Vercel environment variables. Create or update these two Vault secrets in the same Supabase project as the app:

| Vault name | Value |
| --- | --- |
| `diskarte_push_url` | `https://diskarte-ten.vercel.app/api/push/dispatch` |
| `diskarte_push_secret` | The exact value of Vercel's `PUSH_DISPATCH_SECRET`, at least 32 characters |

Use the stable production domain, not a generated preview URL. Both Vault names are case-sensitive; do not include a trailing slash or surrounding quotes in either value. The dispatcher awaits the batch before responding and exports `maxDuration=60` to avoid short serverless defaults. If interrupted, outstanding leases recover through Supabase's recovery job. Supabase owns immediate wakeups and cron; no Vercel Cron job is needed. See [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration).

The dispatcher and LiveKit webhook must be reachable by their external callers without a Vercel login challenge. If deployment protection applies to this domain, configure a suitable production-domain exception under your deployment policy; do not remove the dispatcher's bearer authentication. The current installer accepts only the exact dispatcher path and does not support a protection-bypass query parameter. See [Vercel deployment protection](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection).

## Fixing `PUSH_WAKE_NOT_CONFIGURED`

This error means `private_push.wake()` cannot read a valid dispatcher URL and secret from **Supabase Vault**. Setting Vercel environment variables alone does not configure Vault. The installer transaction rolls back on failure; after correcting Vault, rerun the complete installer rather than enabling delivery manually. Updated installer errors identify which Vault name needs attention without printing its value.

As database owner, this read-only check returns only configuration booleans, including missing secrets:

```sql
select required.name, exists (
  select 1 from vault.decrypted_secrets s
  where s.name = required.name and case required.name
    when 'diskarte_push_url' then s.decrypted_secret ~ '^https://[^/]+/api/push/dispatch$'
    else length(s.decrypted_secret) >= 32
  end
) as configured
from (values ('diskarte_push_url'), ('diskarte_push_secret')) as required(name);
```

Both rows must be true. This does not compare the secret against Vercel or verify HTTP delivery. A missing or short dispatcher secret makes an unauthenticated POST return `503`; a configured secret makes that same request return `401`. An authenticated request can still return `503` for missing VAPID/service-role configuration or a database failure. Never print or share Vault decrypted values during troubleshooting.

## Events and preferences

Trusted database triggers capture direct/group DMs, community invitation DMs, username mentions, moderator `@everyone`/`@here`, role mentions, replies/threads, friend requests, call invitations, moderation warnings, and account suspension changes. Moderators can mention a custom role with `@{Role name}`; visibility checks still apply. Username/role/reply notifications for the same message share a dedupe key. Event reminders are generated for interested users within 15 minutes of an upcoming event, once per event/start time. Editing the start time allows a fresh reminder; cancelling or withdrawing interest suppresses queued delivery.

The existing invitation dialog still sends a real invitation DM; optional validated community metadata selects its push preference. Older databases retain the existing invitation-DM flow while awaiting the additive migration. No bot can send arbitrary push payloads or choose another account's subscription through the client API.

Delivery uses the account's synchronized notification preferences: master push switch, event categories, DM preference, per-server level/mute/expiry, per-channel mute, quiet hours and temporary Do Not Disturb. Existing channel mutes are imported when push is enabled and subsequent changes synchronize. Quiet hours use the IANA time zone captured on device connection, including DST. Reconnect a device to update that zone after travel. Preference conflicts/offline sync must be resolved before test delivery; the UI waits for acknowledgement. Events suppressed by preferences are skipped rather than replayed noisily after quiet hours.

Previews are **off by default**. The encrypted lock-screen payload remains generic unless the account explicitly enables sender/message previews. The setting applies across devices. Sounds are requested using the notification `silent` option; OS/browser support controls actual sound and actions. Taps navigate only to validated local Diskarte paths, with authentication and RLS enforced by the existing destination. Event links open the existing Events dialog. Calls open their existing view; tapping does not automatically accept/join a call.

## Durability, security and limits

- Private-schema subscriptions contain endpoint/encryption keys and reference an authenticated `auth.sessions` row. Users can list safe device metadata, revoke their devices and test only their own device. Registration validates ownership, MFA, bans, HTTPS vendor endpoints, device bounds and keys. The server additionally validates the P-256 key. Devices are capped at ten per account; registration and test events are rate limited in the database.
- The outbox stores source IDs, recipient IDs and event metadata, **not message bodies**. Every attempt resolves current source data and checks membership, channel grants, verification, blocks, bans, session revocation and preferences. Removed/deleted/restricted messages are skipped. No service key or private VAPID key reaches a browser.
- Dispatch authenticates a machine secret with a constant-time comparison. The request body cannot provide recipients or notification contents. Only this exact path bypasses browser CSRF/session middleware; subscription APIs retain normal same-origin and authentication checks.
- Jobs use `FOR UPDATE SKIP LOCKED`, per-attempt random leases, two-minute lease expiry, at most eight attempts, exponential backoff/jitter and bounded `Retry-After`. Vendor 404/410 removes the expired subscription; other permanent 4xx responses fail the delivery. Each batch claims twenty jobs and sends at most four concurrently, with five-second request timeouts. A subsequent immediate wake drains remaining work.
- Outbox/delivery attempts expire after seven days via the recovery job; deleting a subscription removes its secrets while preserving redacted delivery history until that retention cleanup. Sign-out revokes the device/session registrations and clears this browser's subscription, worker account binding and visible notifications. The worker checks its account binding before showing private previews, and delayed setup cannot restore a signed-out binding. Cleanup is best effort: notifications already accepted/displayed by a vendor or OS cannot be reliably recalled; keeping previews off avoids putting private text into the payload.
- External delivery is **at least once**, not mathematically exactly once: a process can stop after a vendor accepts a push but before acknowledgement. Stable event IDs, provider topics, conversation tags, persistent bounded worker deduplication and lease checks suppress ordinary duplicates. Vendors/OSes can delay, coalesce or discard pushes.
- Badges count unread conversations/channels, not every message. Foreground app state updates them; background push includes a fresh database count. Reading elsewhere while this device is closed may leave its badge stale until its next delivery/open. Silent background badge-only pushes are deliberately not used because visible-notification requirements apply. Notification permissions are never requested on page load; revoked/changed subscriptions are cleared and can be re-enabled explicitly.

## Diagnostics and recovery

The authenticated setup API reports configuration and safe device metadata. Hosting logs contain `push_batch` counts and a redacted `push_dispatch_failed` event. No provider bodies, endpoints, keys or message text are logged. The following owner-only queries inspect delivery metadata without revealing content or secrets:

```sql
select status, count(*) from private_push.deliveries group by status;
select last_code, last_status, count(*) from private_push.deliveries group by last_code, last_status;
select min(next_attempt_at) from private_push.deliveries where status='pending';
select jobname, active from cron.job where jobname='diskarte-push-recovery';
select status_code, timed_out, error_msg, created from net._http_response order by created desc limit 10;
```

A 401 dispatcher response to a Vault wake usually means the Vault and hosting secrets differ. A 503 indicates incomplete environment configuration or database/worker failure. Check cron execution status and due jobs after a network outage. Leases recover after two minutes; do not manually mark pending jobs sent. Verify remote URLs and TLS before retrying. Never print subscription rows, Vault decrypted values, or full request headers during troubleshooting.

**Non-destructive rollback:** as database owner, set `private_push.configuration.enabled=false` and unschedule the named `diskarte-push-recovery` cron job. Claims and preparation stop immediately; keep tables for inspection/forward recovery. Roll back application code only after disabling delivery. Do not drop subscriptions or outbox tables as a routine rollback. To resume, restore environment/Vault configuration, rerun the reviewed installer and verify fresh test delivery. Restored databases must remain disabled until their secrets, session validity and device registrations are reviewed; stale subscriptions can require reconnection.

## Verification and remaining acceptance checks

Automated coverage includes migration/installer execution, RLS/ownership, session binding/revocation, actual message-triggered outbox fan-out, multiple devices, role/private-channel authorization, retries/leases/deduplication, preferences/quiet hours, real VAPID/aes128gcm request encryption with device-key decryption, endpoint rejection, permission detection, logout cleanup, worker actions and safe deep links. Chromium E2E injects a standards PushEvent while no Diskarte page is open, then verifies worker notification display and duplicate suppression across an explicit worker restart. This verifies worker/browser behavior; it does **not** contact Apple/Google/Mozilla push services.

Still required with production/staging credentials and physical hardware:

1. Confirm the hosted migration, `pg_net`, cron and Vault setup, then observe an actual vendor-accepted test delivery.
2. Install on an iPhone/iPad (16.4+) and Android device. Enable from a user gesture; verify denial/revocation and reinstall/reconnect behavior.
3. Close the app, lock the device, send a DM from another authorized account, and confirm a genuine OS notification. Repeat with group DMs, mentions, multiple devices and Wi-Fi/mobile-network changes.
4. Tap into the exact DM/message/channel/event after both a valid and expired session. Test membership removal, blocks, quiet hours, mutes and generic lock-screen previews.
5. Verify incoming call timing against its 45-second expiry, Focus/battery settings, iOS/Android badge/sound/action behavior and free-host cold-start latency. Web Push is an invitation alert, not a native telephony/CallKit replacement.

Primary platform references: [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps), [WebKit iOS Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [WebKit badging](https://webkit.org/blog/14112/badging-for-home-screen-web-apps/), [Supabase pg_net](https://supabase.com/docs/guides/database/extensions/pg_net), [Supabase Cron](https://supabase.com/docs/guides/cron/quickstart), [web-push transport](https://github.com/web-push-libs/web-push).
