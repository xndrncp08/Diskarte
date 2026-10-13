import { act, renderHook } from "@testing-library/react";
import type { TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { RemoteTrackPublication, Track } from "livekit-client";
import { describe, expect, it, vi } from "vitest";
import { useScreenWatch, watchScreen } from "../live/useScreenWatch";

function screen(identity: string) {
  const publication = Object.create(RemoteTrackPublication.prototype) as RemoteTrackPublication;
  let desired = true;
  Object.defineProperty(publication, "isDesired", { get: () => desired });
  const setSubscribed = vi.fn((v: boolean) => {
    desired = v;
  });
  Object.defineProperty(publication, "setSubscribed", { value: setSubscribed });
  const ref = { participant: { identity }, source: Track.Source.ScreenShare, publication } as unknown as TrackReferenceOrPlaceholder;
  return { ref, setSubscribed };
}

describe("useScreenWatch", () => {
  it("watches the first share, stops downloading the others, and switches or stops on request", () => {
    const a = screen("ana");
    const b = screen("ben");
    const { result } = renderHook(() => useScreenWatch([a.ref, b.ref]));
    expect(result.current.watched).toBe(a.ref);
    expect(b.setSubscribed).toHaveBeenLastCalledWith(false);
    expect(a.setSubscribed).not.toHaveBeenCalled();

    act(() => watchScreen("ben:screen_share"));
    expect(result.current.watched).toBe(b.ref);
    expect(a.setSubscribed).toHaveBeenLastCalledWith(false);
    expect(b.setSubscribed).toHaveBeenLastCalledWith(true);

    act(() => watchScreen(null));
    expect(result.current.watched).toBeUndefined();
    expect(b.setSubscribed).toHaveBeenLastCalledWith(false);
  });
});
