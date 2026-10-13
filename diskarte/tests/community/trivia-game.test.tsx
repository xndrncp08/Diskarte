import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newTrivia, REVEAL_MS, ROUND_SECONDS, type Trivia } from "@/lib/games/trivia";

vi.mock("@/lib/sfx", async (orig) => ({ ...(await orig<typeof import("@/lib/sfx")>()), playCue: vi.fn() }));
const { TriviaGame } = await import("@/components/voice/live/activities/TriviaGame");

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

let latest: Trivia;

/** Mirrors the call stage: a new onChange (and isDriver) on every render, re-rendered constantly. */
function Room({ initial, players = 2 }: { initial: Trivia; players?: number }) {
  const [game, setGame] = useState(initial);
  const change = (next: Trivia) => {
    latest = next;
    setGame(next);
  };
  return <TriviaGame game={game} me="ana" nameOf={(id) => id ?? ""} isDriver={() => true} players={() => players} onChange={change} />;
}

describe("trivia rounds", () => {
  it("moves on to question 2 even while the stage keeps re-rendering", () => {
    const start = Date.now();
    const { rerender } = render(<Room initial={newTrivia(1, start)} />);
    expect(screen.getByText(/TANONG 1\//)).toBeInTheDocument();
    for (let t = 0; t < (ROUND_SECONDS * 1000 + REVEAL_MS) / 100 + 5; t++) {
      act(() => vi.advanceTimersByTime(100));
      rerender(<Room initial={newTrivia(1, start)} />);
    }
    expect(latest.index).toBe(1);
    expect(screen.getByText(/TANONG 2\//)).toBeInTheDocument();
  });

  it("reveals as soon as everyone in the call has answered", () => {
    render(<Room initial={newTrivia(1, Date.now())} players={1} />);
    act(() => screen.getAllByRole("button", { pressed: false })[0].click());
    expect(latest.phase).toBe("reveal");
    act(() => vi.advanceTimersByTime(REVEAL_MS + 50));
    expect(latest.index).toBe(1);
  });
});
