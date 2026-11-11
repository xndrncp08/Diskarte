# Pulse voice

Voice rooms and calls inside the [Pulse shell](pulse-shell.md): the live strip, the lobby, the stage and the call's
recovery states. Classic renders exactly as before: every piece is a `useShellKind() === "pulse"` branch inside the
existing component (or a Pulse-only component they render), sharing `CallProvider` and all of its behaviour: LiveKit,
rejoin after a reload, device switching, push to talk, the mixer, soundboard, activities, screen share, rings, voice
moderation, voice previews and speaking broadcasts.

| Component | Pulse path |
| --- | --- |
| [`CallStrip`](../../diskarte/src/components/pulse/shell/CallStrip.tsx) | The live strip (and its `compact` phone variant), the call's live region |
| [`VoiceChannelView`](../../diskarte/src/components/voice/VoiceChannelView.tsx) | [`VoiceLobby`](../../diskarte/src/components/voice/pulse/VoiceLobby.tsx), then the stage |
| [`VoiceStage`](../../diskarte/src/components/voice/live/VoiceStage.tsx) | `PulseStage`: participant cards, featured screen with a side rail, the control dock |
| [`ParticipantTile`](../../diskarte/src/components/voice/live/ParticipantTile.tsx), `UnwatchedScreen` | A card with the speaking ring and labelled states |
| [`ConnectionMeter`](../../diskarte/src/components/voice/ConnectionMeter.tsx) | Pulse bars plus the health as a word, Pulse popover |
| [`voice/pulse/`](../../diskarte/src/components/voice/pulse/) | `CallControls`, `DockButton`, `CallRecovery`, `CallAnnouncer`, `SpeakingAvatar`, `ParticipantStates`, `useRoomPeople` |

## Live strip

While you're in a call and not on its stage, a strip across the top of the canvas (tablets and up): the status
(LiveIndicator, or "Connecting…" / "Reconnecting…"), the room and Space (a link to the stage), the connection meter
(bars whose count is the shape cue, and "Excellent / Good / Fair / Poor / Offline" in words), who's in the call
(`AvatarStack`, speakers with a teal ring), **Mute, Deafen, Camera, Share screen** (icon buttons with tooltips), the
mixer, **Leave call** and **Open stage**. Control names never change: the state is `aria-pressed`, the selected tint and
a crossed-out icon. Recovery notices sit under the row.

**Props (stable, for the phone navigation):** `<CallStrip />` is the tablet-and-up strip (`max-md:hidden`) and owns the
call's single live region, so render exactly one. `<CallStrip compact />` is one row for phones (room, Mute, Leave,
Open stage) with a compact recovery notice and no live region; the phone navigation places it above the tab bar. Both
render nothing on the call's own page (`callHref(target)`): the stage has its own dock and notice.

People in the strip come from the LiveKit room you're in (`useRoomPeople`, re-read only when someone joins, leaves or
renames), never from presence.

## Lobby

The voice room before you join: a card with the room ("Voice room" / "Private voice room"), **who's here**
(`AvatarStack` with speakers ringed, "3 people here now", or "Nobody's here yet"), **your devices** (Microphone and
Speaker selects on the saved voice prefs, switching the live call too if you're in one; Safari lists no speakers, so
that select hides; "Test your mic" opens Settings → Voice) and **Join** as the page's one primary button ("Switch to
this room" when you're in another call, "Connecting…" with a spinner while joining).

## Stage

- **Cards, not tiles.** Each person is a card on the canvas surface: their avatar (72 px) or their camera, then their
  name ("(you)" for you) and their state as icons with words under it, never over the picture: *Mic on / Speaking /
  Muted*, *Deafened* (from voice presence; LiveKit doesn't know it), *Camera on*, *Weak connection*. Cards are capped at
  15rem and centred, so two people don't stretch into two giant 16:9 boxes.
- **Speaking:** the card edge turns teal and the avatar gets the static teal ring (a shape, so it works without colour
  or motion). Under `pulse-motion` only, a second ring breathes outwards (`animate-pulse-ring`, CSS). No framer-motion
  in cards: speaking updates come from LiveKit's `useIsSpeaking` per card.
- **Screen share:** the watched share is featured (Focus / Stop watching on raised Pulse buttons, fullscreen as
  before), everyone else in a side rail on the right (a scrolling row on phones), with their states as icons only
  (words kept for screen readers). Other shares are "X is sharing their screen" cards with **Watch**.
- **Control dock:** a raised card that stays at the bottom while the stage scrolls, consistent with the compose dock:
  labelled buttons **Mute, Deafen, Camera, Share screen, Noise filter, Soundboard, Activities, Mixer** and **Leave**
  (alert fill, on-alert text). One Tab stop with arrow keys (Pulse `Toolbar`); 56 px tall, so 44 px on every pointer.
  The soundboard and activities panels are the Classic ones (readable through the Classic bridge).
- Test ids differ from Classic (`pulse-voice-stage`, `participant-card`) so Classic's dark-stage CSS doesn't apply.

## Recovery states

`recoveryKind(call)` picks the most urgent: **Reconnecting** (status), **Call sound is off** (the browser blocked
autoplay: `audioBlocked`, from LiveKit's `AudioPlaybackStatusChanged`), **Microphone blocked** (`micDenied`: the browser
refused the mic on join, unmute or a device error; cleared once unmuting works), **Poor connection** (LiveKit quality
poor or lost). `CallRecovery` shows it inline with what to do next and the fix where there is one: **Turn on sound**
(`room.startAudio()` from the click) and **Try again** (unmutes, which asks for the mic again).

- **Announced once:** the notices are not live regions. `CallAnnouncer` (in the non-compact `CallStrip`, mounted for the
  whole Pulse session) reads each state once when it starts, never again while it lasts or when the strip and the stage
  swap, then "Back in the call." after a reconnect. A connection that flaps between poor and fine is read once per call.
- Classic's floating "Click to turn on call audio" (LiveKit `StartAudio`, `.call-start-audio`) gets Pulse colours and
  hides while a Pulse notice offering "Turn on sound" is on screen (`data-audio-prompt`: the stage's at any width, the
  strip's from md, the compact strip's on phones), so it still works anywhere no notice is visible.

## Messaging and voice

Joining keeps you in the Canvas: the stage replaces the lobby in place, and following any other room puts the live
strip on top of it. **Open stage** goes back to the room's page (a DM call's stage is on the DM page). Coming back to a
conversation keeps what you were reading: `useConversationScroll` remembers the top message and its offset, and
`VirtualMessageList.scrollToAnchor` now sets the row's measured start directly (it used to clamp to a max offset taken
before the scroller was measured, which pulled the transcript up).

## Privacy and performance

- A private room's occupants come from its own `voice:<id>` presence topic, never the server-wide one
  (`useChannelVoicePresence`, used by `useVoiceRoster`, the lobby and the stage's deafened state); its speakers from the
  same topic (`useTopicSpeaking`). In the call, people come from the LiveKit room.
- **Speaking has its own context** (`CallSpeakingContext`, `useCallSpeaking()`): LiveKit's active speakers change
  several times a second, and they used to re-render every `useCall()` consumer (44 of them, every navigator room row
  included). Now only the strip, the mixer's rows and Classic's occupant list re-render for them.

## Tests

- `tests/ui/pulse-voice.test.tsx`: control names and `aria-pressed`, recovery ranking, fixes and the once-only
  announcer, `CallProvider` setting `micDenied` / `audioBlocked`, private-room occupancy never from server presence,
  the speaking ring's reduced-motion fallback, cards' labelled states, the strip (people from the call, Open stage,
  hidden on the stage) and the compact strip.
- `tests/browser/pulse-voice.spec.ts`: axe (WCAG 2.2 AA) in dark and light at 390 and 1280 px on the lobby, the stage
  and the live strip, the featured screen share and the "sound is off" notice; no horizontal overflow; Open stage and
  back keeps the transcript; screenshots in `test-results/pulse-voice-*.png`. A call is faked with localStorage
  `fixture:call` (`tests/browser/call.tsx`); `@livekit/components-react` is aliased to `tests/browser/livekit.tsx`.

```sh
cd diskarte && CI=1 npx playwright test --config playwright.experience.config.ts pulse-voice
```

## Not yet

- The phone call strip above the tab bar is placed by the phone navigation (Step 6b); until then phones keep
  MobileNavigation's call strip.
- The soundboard, activities and mixer panels keep their Classic look (readable through the Classic bridge).
- No real-device check of audio, autoplay or permission prompts: the states are covered with a stubbed LiveKit.
