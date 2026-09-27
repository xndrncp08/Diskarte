"use client";

import { Gamepad2, X } from "lucide-react";
import { useCallback, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useOptionalServer } from "@/components/providers/ServerProvider";
import { Popover } from "@/components/ui/Popover";
import { ACTIVITY_LABEL, type ActivityGame } from "@/lib/activity";
import { newTicTacToe, type TicTacToe } from "@/lib/games/tictactoe";
import { newTrivia, type Trivia } from "@/lib/games/trivia";
import { parseYouTubeId, type WatchState } from "@/lib/youtube";
import { useCall } from "../../CallProvider";
import { TicTacToeBoard } from "./TicTacToeBoard";
import { TriviaGame } from "./TriviaGame";
import type { ActivityControls } from "./useActivity";
import { WatchParty } from "./WatchParty";

function useNameOf(me: string) {
  const server = useOptionalServer();
  const { room } = useCall();
  return useCallback(
    (id: string | null) => {
      if (!id) return "—";
      if (id === me) return "Ikaw";
      const member = server?.members.find((m) => m.user_id === id);
      return member?.nickname ?? member?.profile.display_name ?? room?.remoteParticipants.get(id)?.name ?? "Player";
    },
    [server?.members, room, me],
  );
}

/** A fresh watch party starting at 0:00 now (module-level: reads the clock outside render). */
function watchParty(videoId: string): ActivityGame {
  return { kind: "watch", state: { videoId, playing: true, position: 0, at: Date.now() } };
}

/** The running activity, shown above the call grid. */
export function ActivityStage({ controls }: { controls: ActivityControls }) {
  const { activity, me, update, end, isDriver } = controls;
  const nameOf = useNameOf(me);
  if (!activity) return null;
  const label = ACTIVITY_LABEL[activity.game.kind];
  return (
    <section className="glass relative flex flex-col items-center gap-3 rounded-2xl p-4" aria-label={label.name} data-testid="activity-stage">
      <header className="flex w-full items-center justify-between gap-2">
        <p className="font-pixel text-[10px] text-sun">
          {label.emoji} {label.name.toUpperCase()}
        </p>
        <span className="text-xs text-slate-400">hosted by {nameOf(activity.host)}</span>
        <button type="button" onClick={end} aria-label="End activity" className="touch-target relative rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white">
          <X className="size-4" aria-hidden />
        </button>
      </header>
      {activity.game.kind === "watch" && <WatchParty state={activity.game.state} onChange={(state: WatchState) => update({ kind: "watch", state })} />}
      {activity.game.kind === "tictactoe" && <TicTacToeBoard game={activity.game.state} me={me} nameOf={nameOf} onChange={(state: TicTacToe) => update({ kind: "tictactoe", state })} />}
      {activity.game.kind === "trivia" && (
        <TriviaGame game={activity.game.state} me={me} nameOf={nameOf} isDriver={isDriver} onChange={(state: Trivia) => update({ kind: "trivia", state })} />
      )}
    </section>
  );
}

/** Launcher in the call toolbar. */
export function ActivitiesMenu({ controls }: { controls: ActivityControls }) {
  const [url, setUrl] = useState("");
  const { start, me, activity } = controls;

  function startWatch(event: FormEvent, close: () => void) {
    event.preventDefault();
    const videoId = parseYouTubeId(url);
    if (!videoId) {
      toast.error("Hindi valid na YouTube link.");
      return;
    }
    start(watchParty(videoId));
    setUrl("");
    close();
  }

  return (
    <Popover
      label="Activities"
      testId="activities"
      className="w-80"
      trigger={({ ref, toggle, open, ...aria }) => (
        <button
          ref={ref}
          type="button"
          aria-label="Activities"
          onClick={toggle}
          {...aria}
          className={`flex size-11 items-center justify-center rounded-2xl transition-colors sm:size-12 ${open || activity ? "bg-white text-abyss" : "bg-white/10 text-slate-200 hover:bg-white/20"}`}
        >
          <Gamepad2 className="size-5" aria-hidden />
        </button>
      )}
    >
      {(close) => (
        <div className="space-y-3">
          <p className="font-pixel text-[9px] text-sun">ACTIVITIES</p>
          {activity && <p className="text-xs text-slate-400">Papalitan nito ang kasalukuyang activity.</p>}
          <form onSubmit={(e) => startWatch(e, close)} className="space-y-1.5 rounded-xl border border-white/10 bg-white/5 p-2.5">
            <label htmlFor="watch-url" className="block text-sm font-semibold text-white">
              {ACTIVITY_LABEL.watch.emoji} {ACTIVITY_LABEL.watch.name}
            </label>
            <div className="flex gap-1.5">
              <input
                id="watch-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="YouTube link"
                data-autofocus
                className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white outline-none focus:border-sun/60"
              />
              <button type="submit" className="rounded-md bg-sun px-2.5 text-sm font-bold text-abyss">
                Start
              </button>
            </div>
          </form>
          {(["tictactoe", "trivia"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => {
                start(kind === "tictactoe" ? { kind, state: newTicTacToe(me) } : { kind, state: newTrivia(Date.now(), Date.now()) });
                close();
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-2.5 text-left transition-colors hover:bg-white/10"
            >
              <span className="text-2xl" aria-hidden>
                {ACTIVITY_LABEL[kind].emoji}
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">{ACTIVITY_LABEL[kind].name}</span>
                <span className="block text-xs text-slate-400">{ACTIVITY_LABEL[kind].blurb}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}
