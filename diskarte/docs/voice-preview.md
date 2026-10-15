# Live voice previews

Hover a Tambayan icon, or focus it and press Right Arrow. On touch screens, long-press the icon and select **Voice activity**. Escape dismisses the preview; selecting a channel opens its existing view and never joins automatically.

The authenticated `/api/voice-preview` route first applies channel RLS, membership, platform-ban, MFA and verification checks, then queries only those room names through LiveKit. It rechecks visible channels before returning. Counts come from LiveKit participants with current community membership; only eight avatars per channel are returned. Up to 30 active channels are detailed per preview, with bounded concurrency and timeouts. No room tokens reach the preview.

While open, the preview shares the existing ref-counted `server:<id>` presence channel. Presence updates, reconnection and page foregrounding invalidate the snapshot. Speaking and deafen indicators are advisory existing presence signals, displayed only for identities in the authorized LiveKit snapshot. Closing the preview releases its subscriptions and aborts its fetch. There is no permanent subscription for every server or interval polling.

## Server-side disconnect updates

Configure LiveKit's signed webhook destination as `https://YOUR_SITE/api/livekit/webhook` using the same `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` configured on Diskarte. Set the server-only `SUPABASE_SERVICE_ROLE_KEY` on Render. The route verifies the LiveKit JWT and body digest before accessing the service client. Join, leave, track and room-finished events broadcast an empty invalidation to the existing private server topic. No participant names, channel IDs or credentials are broadcast by this endpoint.

Without webhook configuration, normal app presence changes and foreground/reconnect refreshes still update previews; unexpected server-side disconnects may remain visible until the next refresh. A reconnecting preview offers an explicit refresh control. LiveKit retries failed webhook delivery when the endpoint returns 503.

## Verification

Unit/component tests cover visible-room filtering, removed members, duplicate identities, verification gates, bounded avatars with 250 participants, hover travel, keyboard focus, profile popovers, mobile long-press sheets, shared subscription cleanup, authoritative join/leave refresh, and signed/tampered webhook requests. The full voice browser journey additionally opens a live two-person channel's preview while a call remains connected.

Physical iOS/Android interactions and the production LiveKit webhook configuration require device/deployment verification. No production database migration is needed for this feature.
