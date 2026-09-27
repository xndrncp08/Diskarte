/** 8-bit Tic-Tac-Toe for voice rooms — pure state transitions, synced as whole snapshots. */
export type Mark = "X" | "O";
export type Cell = Mark | "";

export interface TicTacToe {
  board: Cell[];
  players: { X: string | null; O: string | null };
  turn: Mark;
  winner: Mark | "draw" | null;
  line: number[] | null;
}

export const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function newTicTacToe(host: string): TicTacToe {
  return { board: Array(9).fill(""), players: { X: host, O: null }, turn: "X", winner: null, line: null };
}

export function outcome(board: Cell[]): { winner: Mark | "draw" | null; line: number[] | null } {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return { winner: board[a] as Mark, line };
  }
  return { winner: board.every(Boolean) ? "draw" : null, line: null };
}

export function markOf(game: TicTacToe, player: string): Mark | null {
  if (game.players.X === player) return "X";
  if (game.players.O === player) return "O";
  return null;
}

/** Claim the open seat (O). No-op if seated or the game is full. */
export function joinTicTacToe(game: TicTacToe, player: string): TicTacToe {
  if (markOf(game, player) || game.players.O) return game;
  return { ...game, players: { ...game.players, O: player } };
}

export type MoveError = "NOT_A_PLAYER" | "NOT_YOUR_TURN" | "CELL_TAKEN" | "GAME_OVER" | "WAITING_FOR_OPPONENT";

export function playMove(game: TicTacToe, player: string, cell: number): TicTacToe | MoveError {
  if (game.winner) return "GAME_OVER";
  const mark = markOf(game, player);
  if (!mark) return "NOT_A_PLAYER";
  if (!game.players.X || !game.players.O) return "WAITING_FOR_OPPONENT";
  if (game.turn !== mark) return "NOT_YOUR_TURN";
  if (!Number.isInteger(cell) || cell < 0 || cell > 8 || game.board[cell]) return "CELL_TAKEN";
  const board = game.board.slice();
  board[cell] = mark;
  const result = outcome(board);
  return { ...game, board, turn: mark === "X" ? "O" : "X", winner: result.winner, line: result.line };
}

/** Rematch: same players, swapped sides so the other person opens. */
export function rematch(game: TicTacToe): TicTacToe {
  return { board: Array(9).fill(""), players: { X: game.players.O, O: game.players.X }, turn: "X", winner: null, line: null };
}

export function isTicTacToe(value: unknown): value is TicTacToe {
  const v = value as Partial<TicTacToe> | null;
  return (
    !!v &&
    Array.isArray(v.board) &&
    v.board.length === 9 &&
    v.board.every((c) => c === "" || c === "X" || c === "O") &&
    !!v.players &&
    (v.turn === "X" || v.turn === "O")
  );
}
