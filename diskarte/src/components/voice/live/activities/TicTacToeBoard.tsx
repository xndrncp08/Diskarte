"use client";

import { toast } from "sonner";
import { joinTicTacToe, markOf, playMove, rematch, type Mark, type TicTacToe } from "@/lib/games/tictactoe";
import { playSfx } from "@/lib/sfx";
import { cn } from "@/lib/utils";

const MOVE_ERRORS: Record<string, string> = {
  NOT_A_PLAYER: "You're spectating — join first.",
  NOT_YOUR_TURN: "It's not your turn yet!",
  CELL_TAKEN: "That square is taken.",
  GAME_OVER: "The match is over.",
  WAITING_FOR_OPPONENT: "Waiting for an opponent.",
};

function MarkGlyph({ mark }: { mark: Mark }) {
  return mark === "X" ? (
    <svg viewBox="0 0 10 10" className="size-3/5" aria-hidden shapeRendering="crispEdges">
      <path d="M1 1h2v1h1v1h2V2h1V1h2v2H8v1H7v2h1v1h1v2H7V8H6V7H4v1H3v1H1V7h1V6h1V4H2V3H1z" fill="#FFB800" />
    </svg>
  ) : (
    <svg viewBox="0 0 10 10" className="size-3/5" aria-hidden shapeRendering="crispEdges">
      <path d="M3 1h4v1h1v1h1v4H8v1H7v1H3V8H2V7H1V3h1V2h1zm0 2v4h4V3z" fill="#38bdf8" fillRule="evenodd" />
    </svg>
  );
}

/** 3×3 pixel board. `onChange` publishes the next snapshot to the room. */
export function TicTacToeBoard({ game, me, nameOf, onChange }: { game: TicTacToe; me: string; nameOf: (id: string | null) => string; onChange: (next: TicTacToe) => void }) {
  const mine = markOf(game, me);
  const waiting = !game.players.O;

  function play(cell: number) {
    const next = playMove(game, me, cell);
    if (typeof next === "string") {
      toast(MOVE_ERRORS[next]);
      return;
    }
    playSfx(next.winner ? (next.winner === "draw" ? "leave" : "join") : "send");
    onChange(next);
  }

  const status = game.winner
    ? game.winner === "draw"
      ? "Tabla! 🤝"
      : `${nameOf(game.players[game.winner])} wins! 🏆`
    : waiting
      ? "Waiting for an opponent…"
      : `${nameOf(game.players[game.turn])}'s turn (${game.turn})`;

  return (
    <div className="flex flex-col items-center gap-3" data-testid="tictactoe">
      <p className="font-pixel text-[10px] leading-relaxed text-sun" role="status" aria-live="polite">
        {status}
      </p>
      <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-black/40 p-1.5" role="grid" aria-label="Tic-Tac-Toe board">
        {game.board.map((cell, i) => (
          <button
            key={i}
            type="button"
            role="gridcell"
            aria-label={`Row ${Math.floor(i / 3) + 1}, column ${(i % 3) + 1}: ${cell || "empty"}`}
            disabled={Boolean(cell) || Boolean(game.winner) || !mine || game.turn !== mine || waiting}
            onClick={() => play(i)}
            className={cn(
              "flex size-16 items-center justify-center rounded-lg border-2 bg-midnight transition-colors sm:size-20",
              game.line?.includes(i) ? "border-sun bg-sun/15" : "border-white/10",
              !cell && mine && game.turn === mine && !game.winner && !waiting && "hover:border-sun/60 hover:bg-white/5",
            )}
          >
            {cell && <MarkGlyph mark={cell} />}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-300">
        <span>
          <strong className="text-sun">X</strong> {nameOf(game.players.X)}
        </span>
        <span className="text-slate-600">vs</span>
        <span>
          <strong className="text-sky-300">O</strong> {game.players.O ? nameOf(game.players.O) : "—"}
        </span>
      </div>
      {waiting && !mine && (
        <button type="button" onClick={() => onChange(joinTicTacToe(game, me))} className="rounded-lg bg-sky-400 px-3 py-1.5 text-sm font-bold text-abyss hover:bg-sky-300">
          Play! Join as O
        </button>
      )}
      {game.winner && mine && (
        <button type="button" onClick={() => onChange(rematch(game))} className="rounded-lg bg-sun px-3 py-1.5 text-sm font-bold text-abyss hover:brightness-110">
          Rematch
        </button>
      )}
    </div>
  );
}
