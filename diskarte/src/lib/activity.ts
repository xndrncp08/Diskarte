import { isTicTacToe, type TicTacToe } from "@/lib/games/tictactoe";
import { isTrivia, type Trivia } from "@/lib/games/trivia";
import { isWatchState, type WatchState } from "@/lib/youtube";

/**
 * Voice-room activities (watch party, mini-games) are synced over the LiveKit data channel as
 * whole snapshots. Every change bumps `rev`; a client adopts an incoming snapshot only if it's
 * newer (rev, then author id as a tie-break), so concurrent moves converge to the same state.
 */
export type ActivityGame = { kind: "watch"; state: WatchState } | { kind: "tictactoe"; state: TicTacToe } | { kind: "trivia"; state: Trivia };

export interface Activity {
  id: string;
  host: string;
  rev: number;
  author: string;
  game: ActivityGame;
}

export type ActivityMessage = { type: "state"; activity: Activity } | { type: "end"; id: string; rev: number } | { type: "sync-request" };

export const ACTIVITY_TOPIC = "activity";

export function isNewer(incoming: Pick<Activity, "rev" | "author">, current: Pick<Activity, "rev" | "author"> | null) {
  if (!current) return true;
  return incoming.rev > current.rev || (incoming.rev === current.rev && incoming.author > current.author);
}

function isGame(value: unknown): value is ActivityGame {
  const v = value as Partial<{ kind: string; state: unknown }> | null;
  if (!v) return false;
  if (v.kind === "watch") return isWatchState(v.state);
  if (v.kind === "tictactoe") return isTicTacToe(v.state);
  if (v.kind === "trivia") return isTrivia(v.state);
  return false;
}

export function parseActivityMessage(value: unknown): ActivityMessage | null {
  const v = value as Partial<{ type: string; activity: Partial<Activity>; id: string; rev: number }> | null;
  if (!v || typeof v.type !== "string") return null;
  if (v.type === "sync-request") return { type: "sync-request" };
  if (v.type === "end" && typeof v.id === "string" && typeof v.rev === "number") return { type: "end", id: v.id, rev: v.rev };
  if (v.type === "state" && v.activity) {
    const a = v.activity;
    if (typeof a.id === "string" && typeof a.host === "string" && typeof a.rev === "number" && typeof a.author === "string" && isGame(a.game)) {
      return { type: "state", activity: a as Activity };
    }
  }
  return null;
}

/** Applies an incoming message to the local activity (null = none running). */
export function reduceActivity(current: Activity | null, message: ActivityMessage): Activity | null {
  if (message.type === "state") return isNewer(message.activity, current) ? message.activity : current;
  if (message.type === "end") return current && current.id === message.id && message.rev >= current.rev ? null : current;
  return current;
}

/** Local change → next snapshot to broadcast. */
export function bump(activity: Activity, game: ActivityGame, author: string): Activity {
  return { ...activity, game, rev: activity.rev + 1, author };
}

export const ACTIVITY_LABEL: Record<ActivityGame["kind"], { name: string; emoji: string; blurb: string }> = {
  watch: { name: "Watch Party", emoji: "📺", blurb: "Sabay-sabay manood ng YouTube." },
  tictactoe: { name: "Tic-Tac-Toe", emoji: "❌", blurb: "8-bit X at O, isang laban." },
  trivia: { name: "Pinoy Trivia", emoji: "🇵🇭", blurb: "5 tanong, 15 segundo bawat isa." },
};
