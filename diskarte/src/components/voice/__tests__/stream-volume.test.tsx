import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { Track } from "livekit-client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@livekit/components-react", () => ({
  useIsSpeaking: () => false,
  VideoTrack: () => <div data-testid="video" />,
  isTrackReference: () => true,
}));

const { CallContext, effectiveStreamVolume, effectiveVolume } = await import("../CallProvider");
const { ParticipantTile } = await import("../live/ParticipantTile");

function participant(identity: string, isLocal = false) {
  const p = { identity, name: "Ana", metadata: "", isLocal, isMicrophoneEnabled: true, connectionQuality: "unknown", on: () => p, off: () => p };
  return p;
}
const shareOf = (p: ReturnType<typeof participant>) => ({ participant: p, source: Track.Source.ScreenShare, publication: { isSubscribed: true, isMuted: false } }) as unknown as TrackReferenceOrPlaceholder;

function renderTile(ref: TrackReferenceOrPlaceholder, mix = { master: 1, people: {} }) {
  const call = { mix, setStreamVolume: vi.fn(), toggleStreamMute: vi.fn() };
  render(
    <CallContext.Provider value={call as never}>
      <ParticipantTile trackRef={ref} />
    </CallContext.Provider>,
  );
  return call;
}

describe("stream volume", () => {
  it("is separate from the person's voice volume", () => {
    const mix = { master: 0.5, people: { ana: 0.2 }, muted: { ana: true }, streams: { ana: 0.8 } };
    expect(effectiveVolume(mix, "ana")).toBe(0);
    expect(effectiveStreamVolume(mix, "ana")).toBe(0.4);
    expect(effectiveStreamVolume({ ...mix, streamMuted: { ana: true } }, "ana")).toBe(0);
    expect(effectiveStreamVolume({ master: 1, people: {} }, "ben")).toBe(1);
  });

  it("right-clicking someone's screen share offers Stream Volume and Mute Stream", async () => {
    const user = userEvent.setup();
    const call = renderTile(shareOf(participant("ana")), { master: 1, people: {}, streams: { ana: 0.6 } } as never);
    fireEvent.contextMenu(screen.getByTestId("participant-tile"));
    const slider = await screen.findByRole("slider", { name: "Stream volume for Ana" });
    expect(slider).toHaveValue("60");
    fireEvent.change(slider, { target: { value: "25" } });
    expect(call.setStreamVolume).toHaveBeenLastCalledWith("ana", 0.25);
    await user.click(screen.getByRole("menuitemcheckbox", { name: /Mute Stream/ }));
    expect(call.toggleStreamMute).toHaveBeenCalledWith("ana");
  });

  it("has no stream menu on your own share", () => {
    renderTile(shareOf(participant("me", true)));
    fireEvent.contextMenu(screen.getByTestId("participant-tile"));
    expect(screen.queryByRole("slider")).toBeNull();
  });
});
