"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ACTIVITY_TOPIC, bump, parseActivityMessage, reduceActivity, type Activity, type ActivityGame, type ActivityMessage } from "@/lib/activity";
import { useCall } from "../../CallProvider";

/**
 * The room's shared activity. State is replicated to every participant; whoever changes it
 * broadcasts a new snapshot. New joiners ask for a sync and anyone holding state answers.
 */
export function useActivity() {
  // onData / sendData are stable; depending on the whole call value would resubscribe on every mute.
  const { onData, sendData, room } = useCall();
  const me = room?.localParticipant.identity ?? "";
  const [activity, setActivity] = useState<Activity | null>(null);
  const current = useRef<Activity | null>(null);

  const apply = useCallback((message: ActivityMessage) => {
    const next = reduceActivity(current.current, message);
    current.current = next;
    setActivity(next);
  }, []);

  const broadcast = useCallback((message: ActivityMessage) => void sendData(ACTIVITY_TOPIC, message).catch(() => undefined), [sendData]);

  useEffect(() => {
    const off = onData(ACTIVITY_TOPIC, (payload) => {
      const message = parseActivityMessage(payload);
      if (!message) return;
      if (message.type === "sync-request") {
        if (current.current) broadcast({ type: "state", activity: current.current });
        return;
      }
      apply(message);
    });
    broadcast({ type: "sync-request" });
    return off;
  }, [onData, apply, broadcast]);

  const start = useCallback(
    (game: ActivityGame) => {
      const next: Activity = { id: crypto.randomUUID(), host: me, rev: (current.current?.rev ?? 0) + 1, author: me, game };
      apply({ type: "state", activity: next });
      broadcast({ type: "state", activity: next });
    },
    [me, apply, broadcast],
  );

  const update = useCallback(
    (game: ActivityGame) => {
      if (!current.current) return;
      const next = bump(current.current, game, me);
      apply({ type: "state", activity: next });
      broadcast({ type: "state", activity: next });
    },
    [me, apply, broadcast],
  );

  const end = useCallback(() => {
    if (!current.current) return;
    const message: ActivityMessage = { type: "end", id: current.current.id, rev: current.current.rev + 1 };
    apply(message);
    broadcast(message);
  }, [apply, broadcast]);

  /** Who runs timers (trivia rounds): the host while present, else the lowest identity in the room. */
  const isDriver = useCallback(() => {
    const a = current.current;
    if (!a || !room) return false;
    const everyone = [me, ...Array.from(room.remoteParticipants.keys())];
    if (everyone.includes(a.host)) return a.host === me;
    return everyone.sort()[0] === me;
  }, [room, me]);

  return { activity, me, start, update, end, isDriver };
}

export type ActivityControls = ReturnType<typeof useActivity>;
