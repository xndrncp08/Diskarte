# Voice and video

User-facing behaviour. The token flow, room lifecycle, recovery and moderation internals are in
[architecture/voice-and-video.md](../architecture/voice-and-video.md).

**Main code:** [`CallProvider`](../../diskarte/src/components/voice/CallProvider.tsx),
[`VoiceChannelView`](../../diskarte/src/components/voice/VoiceChannelView.tsx),
[`VoiceStage`](../../diskarte/src/components/voice/live/VoiceStage.tsx),
[`VoiceControls`](../../diskarte/src/components/voice/VoiceControls.tsx),
[`CallDock`](../../diskarte/src/components/voice/CallDock.tsx),
[`IncomingCalls`](../../diskarte/src/components/voice/IncomingCalls.tsx).

## Joining and leaving

| Where | How |
| --- | --- |
| Voice channel | Open it: a lobby shows who's inside; **Join** connects. Hovering/focusing the channel pre-loads the call so joining is quick |
| DM or group DM | Call button: rings everyone else for 45 s |
| "Ring to voice" | Ping one member into the voice channel you're in |
| LFG | **Join Party** drops you into the beacon's voice channel |

While connected, the **Voice Connected** dock above your user panel shows where you are, the mixer and
**Disconnect**; on phones a persistent call strip does the same. The call keeps running while you
browse other channels, servers, DMs and Settings. If the page reloads (including after an app
update), the call rejoins automatically within 30 seconds, keeping mute/deafen.

## In a call

| Control | Notes |
| --- | --- |
| Mute / deafen | User panel and call controls |
| Camera | 720p normally, 360p in low-data mode |
| Screen share | 1080p at 15 fps (720p at 5 fps in low-data mode), with optional tab/system audio; **focus mode** goes full screen (fixed overlay on iOS). Only one shared screen is downloaded at a time — pick which to watch |
| Noise suppression / input profile | Isolation, Studio or Custom (Settings → Voice & Video) |
| Push to talk | Hold a chosen key to talk; never triggered while typing |
| Mixer | Master volume, per-person volume, separate screen-share audio volume, local mute and "Disable Video"; remembered on this device |
| Devices | Switch microphone/speakers mid-call; **Mic Test** in settings |
| Connection meter | 8-bit signal bars with latency, packet loss, jitter and LiveKit's quality rating |
| Speaking indicators | A stable ring around whoever is talking, also visible to people browsing the server sidebar |
| Soundboard | Built-in 8-bit sounds and the server's MP3 clips, heard by everyone (2 s cooldown, 6 s max) |
| Activities | YouTube watch party (privacy-enhanced embed, synced play/pause/seek), Tic-Tac-Toe, Pinoy Trivia |

Layout: an adaptive grid picks the column count that makes 16:9 tiles as large as possible
([`lib/voice-layout.ts`](../../diskarte/src/lib/voice-layout.ts)); a screen share switches to a focus
layout.

## Voice activity previews

Hover a Tambayan icon (or focus it and press Right Arrow; long-press → **Voice activity** on touch) to
see who is in each voice channel — up to 8 avatars per channel, mute and streaming state — without
joining. Selecting a channel opens it; it never joins automatically.

## Permissions

- Voice channels: members of the Tambayan who can see the channel and aren't timed out.
- DM calls: participants of the conversation.
- Rings: DM participants or fellow members; never across a block.
- Moderators can server-mute, deafen, disconnect and move members below them.

## Errors and recovery

| Message | Meaning |
| --- | --- |
| "Couldn't connect to voice. Try again." | Token request failed (network) |
| "You're timed out in this server" | Moderator timeout |
| "Voice is not configured on this server" | The deployment lacks LiveKit credentials |
| "Too many voice join attempts" | 20 joins per minute |
| Browser permission prompt denied | Allow microphone/camera in site settings (HTTPS or localhost only) |
| "Click to turn on sound" | Autoplay was blocked after a rejoin |

## Tests

`src/components/voice/__tests__/voice.test.tsx`, `screen-watch.test.tsx`, `stream-volume.test.tsx`,
`src/app/api/livekit/token/__tests__/`, `src/app/api/livekit/webhook/__tests__/`,
`src/app/api/voice-preview/__tests__/`, `tests/ui/IncomingCalls.test.tsx`, `tests/ui/VoiceActivity.test.tsx`,
`tests/ui/voice-preview.test.tsx`, `tests/ui/voice-settings.test.tsx`, `tests/db/rings.test.ts`,
`tests/community/watch-party.test.tsx`, `tests/community/trivia-game.test.tsx`, `e2e/voice.spec.ts`.

## Known limitations

- No recording, transcription, stage/presenter mode, noise gate per participant or E2E encryption.
- Web Push call alerts don't ring a locked phone like a native call.
- Not tested on physical phones or with Bluetooth headsets.
- Can't move members into private voice channels.
