"use client";

import type { TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { RemoteTrackPublication } from "livekit-client";
import { useEffect, useSyncExternalStore } from "react";

export const trackKey = (t: TrackReferenceOrPlaceholder) => `${t.participant.identity}:${t.source}`;

// Which screen share you watch, shared by the call page and the workspace Voice panel.
// undefined = the first one that's shared (default), null = none.
let choice: string | null | undefined;
const listeners = new Set<() => void>();

export function watchScreen(key: string | null) {
  choice = key;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Watch one screen share at a time, like Discord's "Watch Stream": the others stay listed but
 * aren't downloaded (their video is unsubscribed), which saves data when several people share.
 */
export function useScreenWatch(screens: TrackReferenceOrPlaceholder[]) {
  const key = useSyncExternalStore(subscribe, () => choice, () => undefined);
  const watched = key === undefined ? screens[0] : screens.find((s) => trackKey(s) === key);
  const watchedKey = watched ? trackKey(watched) : null;
  const all = screens.map(trackKey).join("|");

  useEffect(() => {
    // Nobody sharing any more: the next share (or call) starts from the default again.
    if (!all) choice = undefined;
    for (const s of screens) {
      // Your own share is local: nothing to subscribe to.
      if (!(s.publication instanceof RemoteTrackPublication)) continue;
      const want = trackKey(s) === watchedKey;
      if (s.publication.isDesired !== want) s.publication.setSubscribed(want);
    }
    // `all` stands in for `screens`, whose array identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, watchedKey]);

  return { watched, watch: watchScreen };
}
