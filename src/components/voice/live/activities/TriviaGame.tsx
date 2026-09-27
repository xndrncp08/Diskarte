"use client";

import { useEffect, useState } from "react";
import { answerTrivia, currentQuestion, leaderboard, newTrivia, nextTrivia, revealTrivia, type Trivia } from "@/lib/games/trivia";
import { builtinClip } from "@/lib/soundboard";
import { getSfxSettings, playCue } from "@/lib/sfx";
import { cn } from "@/lib/utils";

const REVEAL_MS = 4000;

/**
 * Timed rounds. Everyone answers locally and publishes; the room's "driver" closes each round at
 * its deadline and advances after a short reveal.
 */
export function TriviaGame({
  game,
  me,
  nameOf,
  onChange,
  isDriver,
}: {
  game: Trivia;
  me: string;
  nameOf: (id: string | null) => string;
  onChange: (next: Trivia) => void;
  isDriver: () => boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  const q = currentQuestion(game);

  useEffect(() => {
    if (game.phase === "done") return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [game.phase]);

  // Driver: close the round at the deadline, then move on after the reveal.
  useEffect(() => {
    if (!isDriver()) return;
    if (game.phase === "question") {
      const t = setTimeout(() => onChange(revealTrivia(game)), Math.max(0, game.deadline - Date.now()));
      return () => clearTimeout(t);
    }
    if (game.phase === "reveal") {
      const t = setTimeout(() => onChange(nextTrivia(game, Date.now())), REVEAL_MS);
      return () => clearTimeout(t);
    }
  }, [game, onChange, isDriver]);

  // Right/wrong jingle when the answer is revealed.
  useEffect(() => {
    if (game.phase !== "reveal" || !(me in game.answers) || !q) return;
    const clip = builtinClip(game.answers[me] === q.answer ? "tama" : "mali");
    if (clip) playCue(clip.cue, getSfxSettings().volume || 0.5);
  }, [game.phase, game.answers, me, q]);

  if (game.phase === "done" || !q) {
    const board = leaderboard(game);
    return (
      <div className="flex flex-col items-center gap-3 text-center" data-testid="trivia">
        <p className="font-pixel text-[10px] text-sun">GAME OVER</p>
        <ol className="w-full max-w-xs space-y-1">
          {board.length === 0 && <li className="text-sm text-slate-400">Walang sumagot. 😅</li>}
          {board.map((row, i) => (
            <li key={row.player} className={cn("flex items-center justify-between rounded-lg px-3 py-1.5 text-sm", i === 0 ? "bg-sun/15 text-sun" : "bg-white/5 text-slate-200")}>
              <span>
                {i === 0 ? "👑 " : `${i + 1}. `}
                {nameOf(row.player)}
              </span>
              <strong>{row.score}</strong>
            </li>
          ))}
        </ol>
        <button type="button" onClick={() => onChange(newTrivia(Date.now(), Date.now()))} className="rounded-lg bg-sun px-3 py-1.5 text-sm font-bold text-abyss hover:brightness-110">
          Isa pa!
        </button>
      </div>
    );
  }

  const secondsLeft = Math.max(0, Math.ceil((game.deadline - now) / 1000));
  const mine = game.answers[me];
  const revealing = game.phase === "reveal";

  return (
    <div className="flex w-full max-w-lg flex-col gap-3" data-testid="trivia">
      <div className="flex items-center justify-between font-pixel text-[9px] text-slate-400">
        <span>
          TANONG {game.index + 1}/{game.order.length}
        </span>
        <span className={cn(secondsLeft <= 5 && !revealing && "text-red-400")} aria-live="polite">
          {revealing ? "SAGOT!" : `${secondsLeft}s`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
        <div className="h-full bg-sun transition-[width] duration-200" style={{ width: revealing ? "0%" : `${Math.min(100, (secondsLeft / 15) * 100)}%` }} />
      </div>
      <p className="text-lg font-bold text-white">{q.q}</p>
      <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Choices">
        {q.choices.map((choice, i) => {
          const picked = mine === i;
          const correct = revealing && i === q.answer;
          const wrong = revealing && picked && i !== q.answer;
          const pickers = revealing ? Object.entries(game.answers).filter(([, c]) => c === i) : [];
          return (
            <button
              key={choice}
              type="button"
              aria-pressed={picked}
              disabled={revealing || mine !== undefined}
              onClick={() => onChange(answerTrivia(game, me, i, Date.now()))}
              className={cn(
                "rounded-xl border-2 px-3 py-2.5 text-left text-sm font-semibold transition-colors",
                correct ? "border-emerald-400 bg-emerald-500/20 text-emerald-100" : wrong ? "border-red-400 bg-red-500/15 text-red-200" : picked ? "border-sun bg-sun/15 text-white" : "border-white/10 bg-white/5 text-slate-200 hover:border-white/30",
              )}
            >
              <span className="mr-2 font-pixel text-[9px] text-slate-500">{"ABCD"[i]}</span>
              {choice}
              {pickers.length > 0 && <span className="mt-1 block text-[11px] font-normal text-slate-400">{pickers.map(([p]) => nameOf(p)).join(", ")}</span>}
            </button>
          );
        })}
      </div>
      <p className="text-center text-xs text-slate-500">{Object.keys(game.answers).length} na ang sumagot</p>
    </div>
  );
}
