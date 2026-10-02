/** Pinoy Trivia: timed multiple-choice rounds for voice rooms. Pure state; synced as snapshots. */
export interface TriviaQuestion {
  q: string;
  choices: [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
}

export const TRIVIA_QUESTIONS: TriviaQuestion[] = [
  { q: "What is the national flower of the Philippines?", choices: ["Sampaguita", "Gumamela", "Rosal", "Ilang-ilang"], answer: 0 },
  { q: "Which province is home to the Chocolate Hills?", choices: ["Cebu", "Bohol", "Palawan", "Iloilo"], answer: 1 },
  { q: "How many islands make up the Philippines (official count since 2016)?", choices: ["7,107", "7,461", "7,641", "8,000"], answer: 2 },
  { q: "Who wrote 'Noli Me Tángere'?", choices: ["Andres Bonifacio", "Marcelo H. del Pilar", "Jose Rizal", "Apolinario Mabini"], answer: 2 },
  { q: "In what year was Philippine independence declared in Kawit, Cavite?", choices: ["1896", "1898", "1901", "1946"], answer: 1 },
  { q: "What is the highest mountain in the Philippines?", choices: ["Mt. Pulag", "Mt. Apo", "Mt. Mayon", "Mt. Pinatubo"], answer: 1 },
  { q: "Which animal is called 'kalabaw' in Filipino?", choices: ["Water buffalo", "Ox", "Yak", "Bison"], answer: 0 },
  { q: "Which rice cake is made of sticky rice and coconut wrapped in banana leaves?", choices: ["Puto", "Suman", "Bibingka", "Kutsinta"], answer: 1 },
  { q: "Where did Ferdinand Magellan first land in the Philippines in 1521?", choices: ["Limasawa", "Homonhon", "Mactan", "Cebu"], answer: 1 },
  { q: "Which city is called the 'Summer Capital of the Philippines'?", choices: ["Tagaytay", "Baguio", "Sagada", "Davao"], answer: 1 },
  { q: "Which dance is performed between clapping bamboo poles?", choices: ["Pandanggo sa Ilaw", "Tinikling", "Cariñosa", "Singkil"], answer: 1 },
  { q: "Which color is NOT on the Philippine flag?", choices: ["Blue", "Red", "Yellow", "Green"], answer: 3 },
  { q: "Which boxer is known as the 'People's Champ' ('Pambansang Kamao')?", choices: ["Nonito Donaire", "Manny Pacquiao", "Onyok Velasco", "Flash Elorde"], answer: 1 },
  { q: "What is the traditional men's formal shirt called?", choices: ["Baro't saya", "Barong Tagalog", "Kimona", "Terno"], answer: 1 },
  { q: "In which city is Magellan's Cross?", choices: ["Manila", "Cebu City", "Iloilo City", "Vigan"], answer: 1 },
  { q: "What is the national bird of the Philippines?", choices: ["Maya", "Philippine Eagle", "Kalaw", "Tarictic"], answer: 1 },
  { q: "Which festival is Kalibo, Aklan famous for?", choices: ["Sinulog", "Ati-Atihan", "Pahiyas", "Kadayawan"], answer: 1 },
  { q: "How many years did the Galleon Trade last, from 1565 to 1815?", choices: ["150", "200", "250", "300"], answer: 2 },
  { q: "Which street food is a fertilized duck egg?", choices: ["Kwek-kwek", "Penoy", "Balut", "Tokneneng"], answer: 2 },
  { q: "Which province is Mayon Volcano in?", choices: ["Sorsogon", "Albay", "Camarines Sur", "Batangas"], answer: 1 },
];

export const ROUND_SECONDS = 15;
export const QUESTIONS_PER_GAME = 5;

export interface Trivia {
  order: number[];
  index: number;
  phase: "question" | "reveal" | "done";
  /** Epoch ms when answering closes. */
  deadline: number;
  answers: Record<string, number>;
  scores: Record<string, number>;
}

/** Deterministic shuffle from a numeric seed (so every client can verify the same order). */
export function shuffledOrder(seed: number, count = QUESTIONS_PER_GAME, pool = TRIVIA_QUESTIONS.length): number[] {
  const ids = Array.from({ length: pool }, (_, i) => i);
  let s = seed >>> 0 || 1;
  for (let i = ids.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, Math.min(count, pool));
}

export function newTrivia(seed: number, now: number): Trivia {
  return { order: shuffledOrder(seed), index: 0, phase: "question", deadline: now + ROUND_SECONDS * 1000, answers: {}, scores: {} };
}

export function currentQuestion(game: Trivia): TriviaQuestion | null {
  return TRIVIA_QUESTIONS[game.order[game.index]] ?? null;
}

/** First answer counts; late answers are ignored. */
export function answerTrivia(game: Trivia, player: string, choice: number, now: number): Trivia {
  if (game.phase !== "question" || now > game.deadline || player in game.answers || !Number.isInteger(choice) || choice < 0 || choice > 3) return game;
  return { ...game, answers: { ...game.answers, [player]: choice } };
}

/** Close the round: +1 for every correct answer. */
export function revealTrivia(game: Trivia): Trivia {
  if (game.phase !== "question") return game;
  const q = currentQuestion(game);
  const scores = { ...game.scores };
  for (const [player, choice] of Object.entries(game.answers)) {
    scores[player] = (scores[player] ?? 0) + (q && choice === q.answer ? 1 : 0);
  }
  return { ...game, phase: "reveal", scores };
}

export function nextTrivia(game: Trivia, now: number): Trivia {
  if (game.phase !== "reveal") return game;
  if (game.index + 1 >= game.order.length) return { ...game, phase: "done" };
  return { ...game, index: game.index + 1, phase: "question", deadline: now + ROUND_SECONDS * 1000, answers: {} };
}

export function leaderboard(game: Trivia): { player: string; score: number }[] {
  return Object.entries(game.scores)
    .map(([player, score]) => ({ player, score }))
    .sort((a, b) => b.score - a.score || a.player.localeCompare(b.player));
}

export function isTrivia(value: unknown): value is Trivia {
  const v = value as Partial<Trivia> | null;
  return !!v && Array.isArray(v.order) && typeof v.index === "number" && (v.phase === "question" || v.phase === "reveal" || v.phase === "done") && typeof v.deadline === "number";
}
