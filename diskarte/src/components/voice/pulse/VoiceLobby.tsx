"use client";

import { Settings2, Volume2 } from "lucide-react";
import { useSyncExternalStore } from "react";
import { serverTopic, useTopicSpeaking, voiceTopic } from "@/components/providers/PresenceProvider";
import { useServer } from "@/components/providers/ServerProvider";
import { useSettingsDialog } from "@/components/profile/SettingsDialog";
import { AvatarStack } from "@/components/pulse/Avatar";
import { Button } from "@/components/pulse/Button";
import { Select } from "@/components/pulse/Field";
import { HelpLink } from "@/components/ui/HelpLink";
import { useMediaDevices } from "@/hooks/useMediaDevices";
import { useVoiceRoster } from "@/hooks/useVoiceRoster";
import type { Channel } from "@/lib/servers";
import { DEFAULT_VOICE_PREFS, readVoicePrefs, setVoicePrefs, subscribeVoicePrefs } from "@/lib/voice-prefs";
import { useCall } from "../CallProvider";

/** Microphone and speaker for the next join (and the current call, if you're in one), from the saved voice prefs. */
function DevicePreview() {
  const call = useCall();
  const prefs = useSyncExternalStore(subscribeVoicePrefs, readVoicePrefs, () => DEFAULT_VOICE_PREFS);
  const mics = useMediaDevices("audioinput");
  const speakers = useMediaDevices("audiooutput");
  const settings = useSettingsDialog();
  const pick = (kind: "audioinput" | "audiooutput", id: string) => {
    setVoicePrefs(kind === "audioinput" ? { inputId: id || null } : { outputId: id || null });
    if (call.status === "connected") void call.switchDevice(kind, id || "default");
  };
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-pulse-label font-semibold text-pulse-text">Your devices</legend>
      <Select label="Microphone" value={prefs.inputId ?? ""} onChange={(e) => pick("audioinput", e.target.value)}>
        <option value="">System default</option>
        {mics.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>)}
      </Select>
      {/* Safari lists no outputs (it can't switch them): the system speaker is used. */}
      {speakers.length > 0 && (
        <Select label="Speaker" value={prefs.outputId ?? ""} onChange={(e) => pick("audiooutput", e.target.value)}>
          <option value="">System default</option>
          {speakers.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Speaker ${i + 1}`}</option>)}
        </Select>
      )}
      {settings && (
        <Button variant="quiet" size="sm" icon={<Settings2 />} onClick={() => settings.openSettings("voice")} className="self-start">
          Test your mic
        </Button>
      )}
    </fieldset>
  );
}

/**
 * The Pulse voice lobby (the room before you join): who's here (speakers ringed, from the room's own presence topic when
 * it's private), your microphone and speaker, and Join as the page's one primary action.
 */
export function VoiceLobby({ channel, joining, label, onJoin }: { channel: Channel; joining: boolean; label: string; onJoin: () => void }) {
  const { server } = useServer();
  const inRoom = useVoiceRoster(channel.id);
  // Watching from outside: the members' speaking broadcasts, on a private room's own topic (never the server-wide one).
  const speaking = useTopicSpeaking(channel.is_private ? voiceTopic(channel.id) : serverTopic(server.id));
  const people = inRoom.map(({ member }) => ({ ...member.profile, display_name: member.nickname ?? member.profile.display_name, speaking: speaking.has(member.user_id) }));
  return (
    <div className="flex flex-1 flex-col items-center overflow-y-auto p-3 font-pulse-text md:justify-center md:p-8" data-testid="voice-lobby">
      <div className="flex w-full max-w-md flex-col gap-5 rounded-pulse-card border border-pulse-line bg-pulse-surface p-5 shadow-pulse-1 md:p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-pulse-item bg-pulse-live-tint text-pulse-live" aria-hidden>
            <Volume2 className="size-6" />
          </span>
          <div className="min-w-0">
            <p className="text-pulse-caption font-semibold text-pulse-muted">{channel.is_private ? "Private voice room" : "Voice room"}</p>
            <h2 className="truncate font-pulse-display text-pulse-title font-semibold text-pulse-text">{channel.name}</h2>
          </div>
        </div>
        <section aria-label="Who's here" className="flex min-h-11 items-center gap-3">
          {people.length > 0 ? (
            <>
              <AvatarStack people={people} max={5} size={36} />
              <p className="text-pulse-label text-pulse-muted">{people.length === 1 ? "1 person here now" : `${people.length} people here now`}</p>
            </>
          ) : (
            <p className="text-pulse-label text-pulse-muted">Nobody&apos;s here yet. Join and start the room.</p>
          )}
        </section>
        <DevicePreview />
        <Button variant="primary" size="lg" loading={joining} onClick={onJoin} className="w-full" data-testid="join-voice">
          {label}
        </Button>
        <p className="text-pulse-caption text-pulse-muted">
          Your browser will ask for your microphone. Turn on your camera or share your screen once you&apos;re in.
        </p>
        <HelpLink topic="voice" label="Trouble connecting?" className="self-start" />
      </div>
    </div>
  );
}
