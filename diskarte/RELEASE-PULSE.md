# Diskarte Pulse — public opt-in release (2026-11-13)

Status: released to production as an opt-in on 2026-11-13 (`DISKARTE_PULSE_ROLLOUT=opt-in` on Vercel
Production). Classic remains the default. Registered as `2026-11-13-pulse` in `src/content/releases.json`.

## User-facing changes

- Canvas layout with one Spaces navigator, editorial conversations and contextual member/pin/details panels.
- Warm dark and off-white light surfaces, Solar Gold accents, Bricolage Grotesque headings and Figtree interface text.
- Phone navigation for Home, People, Spaces and You, full-screen conversations and touch action sheets.
- Voice Stage, persistent live call strip, labelled controls and sound/microphone/reconnection recovery states.
- Optional **Settings → Appearance → Try the new Diskarte**; Classic remains the default and users can return at any time.

## Deployment requirements

- Run and record the checks in [the rollout gate](../docs/design/pulse-rollout.md).
- `DISKARTE_PULSE_ROLLOUT=opt-in` opens public opt-in. Leaving it unset keeps the super-admin preview.
- Step 6/7 adds no migrations. Optional community customization migration
  `20261109010000_community_identity.sql` remains on the separate `feat/community-identity` branch;
  the Pulse UI falls back to the default look without its fields.
- Production's database was brought level with the repository on 2026-11-12 (privacy hardening,
  avatar listing and the October catch-up); see `docs/sql/production-catchup.sql`.
- Rollback: unset `DISKARTE_PULSE_ROLLOUT` and redeploy. Open clients return to Classic on their next
  refresh or navigation; clearing the `diskarte-shell` cookie returns one browser immediately.

## Community announcement

Registered in `src/content/releases.json` as `2026-11-13-pulse`; the post below is what the publisher formats.

**Title:** Try the new Diskarte

**Summary:** Pulse brings your Spaces, conversations and calls into one canvas. Classic is still the
default. When the preview is available, open Settings → Appearance → Try the new Diskarte to give it
a try, and switch back whenever you like.

**Highlights:**

- Find your way around with one Spaces navigator, or Home, People, Spaces and You on your phone.
- Read conversations in the new canvas and open members, pinned messages and details when you need them.
- Join the new voice Stage, keep a call close while browsing, and get clearer help when sound or microphone access is blocked.
- Keep your existing messages, communities and settings while choosing the look that works for you.

**Help links:** [Try Pulse](../docs/user-guide/pulse.md) (`/docs/guides/pulse`),
[Calls](../docs/user-guide/calls.md) (`/docs/guides/calls`),
[Changelog](CHANGELOG.md) (`/docs/changelog`).

Publication status: see the rollout record in `docs/design/pulse-rollout.md`.
