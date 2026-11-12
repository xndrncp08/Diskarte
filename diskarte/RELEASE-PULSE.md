# Diskarte Pulse — pending opt-in release

Status: local preparation. No production release or announcement is claimed here.

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
- The combined Pulse branch includes earlier privacy work, including avatar-listing restrictions.
  Check production readiness for `20261109000000_privacy_hardening.sql` and
  `20261109020000_avatar_listing.sql`. Any pending production migrations require a separate review
  and explicit authorization. Never apply them as part of an automatic app deploy.
- Do not push the separately pending privacy-hardening release under this handoff's authorization.
- No full backend/device acceptance or production announcement is implied by local fixture tests.

## Pending community announcement

Do not add this to the automatic publication manifest until the production release is verified.

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

Publication status: pending production verification; this draft has not been published.
