// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bump, isNewer, parseActivityMessage, reduceActivity, type Activity } from "@/lib/activity";
import {
  auditExcerpt,
  automodSettingsSchema,
  boostLevel,
  communityError,
  describeAudit,
  formatDuration,
  formatMobile,
  isBeaconLive,
  lfgSchema,
  minutesLeft,
  parseTermList,
  supportSettingsSchema,
} from "@/lib/community";
import { joinTicTacToe, newTicTacToe, outcome, playMove, rematch, type TicTacToe } from "@/lib/games/tictactoe";
import { answerTrivia, currentQuestion, leaderboard, newTrivia, nextTrivia, revealTrivia, ROUND_SECONDS, shuffledOrder, TRIVIA_QUESTIONS } from "@/lib/games/trivia";
import { getLowDataMode, imageQuality, resetLowDataCache, setLowDataMode, subscribeLowDataMode } from "@/lib/low-data";
import { dequeue, enqueue, isNetworkError, outboxFor, outboxSize, type OutboxEntry } from "@/lib/outbox";
import { classifyFriendships, conversationTitle, isUnread, sortConversations, type Friendship } from "@/lib/social";
import { BUILTIN_CLIPS, builtinClip, createThrottle, parseSoundboardMessage } from "@/lib/soundboard";
import { cueDuration } from "@/lib/sfx";
import { getSticker, isStickerId, STICKERS, STICKER_PACKS } from "@/lib/stickers";
import { expectedPosition, isWatchState, needsResync, parseYouTubeId, playerCommand, youtubeEmbedUrl } from "@/lib/youtube";

// node environment: give the storage-backed modules a tiny localStorage.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

beforeEach(() => store.clear());

describe("support badges & boosts", () => {
  it("levels up at 2 / 7 / 14 boosters", () => {
    expect(boostLevel(0)).toEqual({ level: 0, next: 2 });
    expect(boostLevel(2)).toEqual({ level: 1, next: 7 });
    expect(boostLevel(7)).toEqual({ level: 2, next: 14 });
    expect(boostLevel(20)).toEqual({ level: 3, next: null });
  });

  it("normalises PH mobile numbers and rejects junk", () => {
    const ok = supportSettingsSchema.parse({ gcashNumber: "+63 917 123 4567", mayaNumber: "", supportNote: "  Salamat!  " });
    expect(ok).toEqual({ gcashNumber: "09171234567", mayaNumber: null, supportNote: "Salamat!" });
    expect(supportSettingsSchema.safeParse({ gcashNumber: "12345", mayaNumber: "", supportNote: "" }).success).toBe(false);
    expect(formatMobile("09171234567")).toBe("0917 123 4567");
  });
});

describe("Bantay-Bayan helpers", () => {
  it("parses custom blocked words from lines or commas, deduped and lower-cased", () => {
    const terms = parseTermList("Scam, benta account\nSCAM\n\n  x ");
    const parsed = automodSettingsSchema.safeParse({ enabled: true, categories: ["spam"], customTerms: terms });
    expect(parsed.success).toBe(false); // "x" is too short
    const valid = automodSettingsSchema.parse({ enabled: true, categories: ["spam", "phishing"], customTerms: ["Scam", "benta account", "SCAM"] });
    expect(valid.customTerms).toEqual(["scam", "benta account"]);
    expect(automodSettingsSchema.safeParse({ enabled: true, categories: ["nsfw"], customTerms: [] }).success).toBe(false);
  });

  it("formats slow mode durations", () => {
    expect(formatDuration(5)).toBe("5s");
    expect(formatDuration(90)).toBe("1m 30s");
    expect(formatDuration(21600)).toBe("6h");
  });

  it("describes audit entries in plain language", () => {
    const name = (id: string | null | undefined) => ({ u1: "Maria", u2: "Troll", u3: "Juan" })[id ?? ""] ?? "Someone";
    expect(describeAudit({ action: "member.ban", actor_id: "u1", target_id: "u2", metadata: { reason: "spam" } }, name)).toBe("Maria banned Troll — spam");
    expect(describeAudit({ action: "member.role_update", actor_id: "u1", target_id: "u3", metadata: { from: "member", to: "moderator" } }, name)).toBe(
      "Maria changed Juan's role: member → moderator",
    );
    expect(describeAudit({ action: "automod.block", actor_id: "u3", target_id: null, metadata: { author_id: "u3", category: "phishing" } }, name)).toBe(
      "Bantay-Bayan blocked a message from Juan (Phishing links)",
    );
    expect(describeAudit({ action: "channel.create", actor_id: null, target_id: "c", metadata: { name: "memes", type: "text" } }, name)).toBe("System created #memes");
    expect(auditExcerpt({ metadata: { excerpt: "hello" } })).toBe("hello");
    expect(auditExcerpt({ metadata: {} })).toBeNull();
  });

  it("maps database error codes to friendly English", () => {
    expect(communityError('new row violates... "SLOWMODE"')).toMatch(/Slow mode/);
    expect(communityError("BANNED")).toMatch(/banned/);
    expect(communityError("permission denied for table x")).toMatch(/permission/);
    expect(communityError("weird", "fallback")).toBe("fallback");
  });
});

describe("LFG", () => {
  it("validates beacon input", () => {
    const beacon = lfgSchema.parse({ game: " Valorant ", description: "Gold+", partySize: "5", durationMinutes: "60", voiceChannelId: "" });
    expect(beacon).toEqual({ game: "Valorant", description: "Gold+", partySize: 5, durationMinutes: 60, voiceChannelId: null });
    expect(lfgSchema.safeParse({ game: "", description: "", partySize: 1, durationMinutes: 60, voiceChannelId: "" }).success).toBe(false);
  });

  it("hides closed and expired beacons", () => {
    const now = Date.parse("2026-09-27T10:00:00Z");
    expect(isBeaconLive({ status: "open", expires_at: "2026-09-27T10:30:00Z" }, now)).toBe(true);
    expect(isBeaconLive({ status: "full", expires_at: "2026-09-27T10:30:00Z" }, now)).toBe(true);
    expect(isBeaconLive({ status: "closed", expires_at: "2026-09-27T10:30:00Z" }, now)).toBe(false);
    expect(isBeaconLive({ status: "open", expires_at: "2026-09-27T09:59:00Z" }, now)).toBe(false);
    expect(minutesLeft("2026-09-27T10:30:00Z", now)).toBe(30);
  });
});

describe("stickers", () => {
  it("has two packs and only known ids are valid", () => {
    expect(STICKER_PACKS.map((p) => p.id)).toEqual(["salitang-kanto", "tambayan"]);
    expect(STICKERS.every((s) => /^[a-z0-9][a-z0-9_-]{1,39}$/.test(s.id))).toBe(true); // matches the DB check
    expect(isStickerId("sana-all")).toBe(true);
    expect(isStickerId("<script>")).toBe(false);
    expect(getSticker("jeepney")?.label).toBe("Jeepney");
  });
});

describe("offline outbox", () => {
  const entry = (id: string, target = "c1"): OutboxEntry => ({ id, target, content: `msg ${id}`, replyToId: null, threadId: null, sticker: null, createdAt: "2026-09-27T00:00:00Z" });

  it("persists entries per target and removes them when sent", () => {
    enqueue(entry("a"));
    enqueue(entry("b"));
    enqueue(entry("c", "c2"));
    enqueue(entry("a")); // re-queueing the same id doesn't duplicate
    expect(outboxFor("c1").map((e) => e.id)).toEqual(["b", "a"]);
    expect(outboxSize()).toBe(3);
    dequeue("a");
    expect(outboxFor("c1").map((e) => e.id)).toEqual(["b"]);
  });

  it("ignores corrupt storage", () => {
    store.set("diskarte:outbox", '[{"id":1},"x",null]');
    expect(outboxFor("c1")).toEqual([]);
    store.set("diskarte:outbox", "{not json");
    expect(outboxSize()).toBe(0);
  });

  it("recognises network failures", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new Error("RATE_LIMITED"))).toBe(false);
  });
});

describe("low-data mode", () => {
  it("persists and notifies subscribers", () => {
    resetLowDataCache();
    expect(getLowDataMode()).toBe(false);
    const listener = vi.fn();
    const off = subscribeLowDataMode(listener);
    setLowDataMode(true);
    expect(listener).toHaveBeenCalledTimes(1);
    resetLowDataCache();
    expect(getLowDataMode()).toBe(true);
    off();
    setLowDataMode(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(imageQuality(true)).toBeLessThan(imageQuality(false));
  });
});

describe("soundboard", () => {
  it("ships a dozen built-in 8-bit clips that all fit the 6 s cap", () => {
    expect(BUILTIN_CLIPS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(BUILTIN_CLIPS.map((c) => c.key)).size).toBe(BUILTIN_CLIPS.length);
    for (const clip of BUILTIN_CLIPS) expect(cueDuration(clip.cue)).toBeLessThan(6);
    expect(builtinClip("airhorn")?.emoji).toBe("📯");
  });

  it("only accepts well-formed play messages", () => {
    expect(parseSoundboardMessage({ type: "play", kind: "builtin", key: "coin" })).toEqual({ type: "play", kind: "builtin", key: "coin" });
    expect(parseSoundboardMessage({ type: "play", kind: "builtin", key: "rm -rf" })).toBeNull();
    expect(parseSoundboardMessage({ type: "play", kind: "clip", clipId: "00000000-0000-4000-8000-000000000001" })).toMatchObject({ kind: "clip" });
    expect(parseSoundboardMessage({ type: "play", kind: "clip", clipId: "../../etc" })).toBeNull();
    expect(parseSoundboardMessage("nope")).toBeNull();
  });

  it("throttles per sender", () => {
    let t = 0;
    const allow = createThrottle(2000, () => t);
    expect(allow("a")).toBe(true);
    expect(allow("a")).toBe(false);
    expect(allow("b")).toBe(true);
    t = 2500;
    expect(allow("a")).toBe(true);
  });
});

describe("tic-tac-toe", () => {
  it("plays a full game with turn order and win detection", () => {
    let game: TicTacToe = joinTicTacToe(newTicTacToe("x"), "o");
    expect(playMove(game, "o", 0)).toBe("NOT_YOUR_TURN");
    expect(playMove(game, "spectator", 0)).toBe("NOT_A_PLAYER");
    for (const [player, cell] of [["x", 0], ["o", 3], ["x", 1], ["o", 4]] as const) game = playMove(game, player, cell) as TicTacToe;
    expect(playMove(game, "x", 0)).toBe("CELL_TAKEN");
    game = playMove(game, "x", 2) as TicTacToe;
    expect(game.winner).toBe("X");
    expect(game.line).toEqual([0, 1, 2]);
    expect(playMove(game, "o", 5)).toBe("GAME_OVER");
    const again = rematch(game);
    expect(again.players).toEqual({ X: "o", O: "x" });
    expect(again.board.every((c) => c === "")).toBe(true);
  });

  it("waits for an opponent and detects draws", () => {
    expect(playMove(newTicTacToe("x"), "x", 4)).toBe("WAITING_FOR_OPPONENT");
    expect(outcome(["X", "O", "X", "X", "O", "O", "O", "X", "X"]).winner).toBe("draw");
  });
});

describe("Pinoy trivia", () => {
  it("has well-formed questions and a deterministic shuffle", () => {
    for (const q of TRIVIA_QUESTIONS) {
      expect(q.choices).toHaveLength(4);
      expect(new Set(q.choices).size).toBe(4);
    }
    expect(shuffledOrder(42)).toEqual(shuffledOrder(42));
    expect(new Set(shuffledOrder(42)).size).toBe(5);
  });

  it("scores the first answer inside the deadline and advances rounds", () => {
    const start = 1_000_000;
    let game = newTrivia(7, start);
    const q = currentQuestion(game)!;
    const wrong = (q.answer + 1) % 4;
    game = answerTrivia(game, "juan", q.answer, start + 1000);
    game = answerTrivia(game, "juan", wrong, start + 2000); // second answer ignored
    game = answerTrivia(game, "maria", wrong, start + 2000);
    game = answerTrivia(game, "late", q.answer, start + ROUND_SECONDS * 1000 + 1);
    game = revealTrivia(game);
    expect(game.scores).toEqual({ juan: 1, maria: 0 });
    expect(leaderboard(game)[0]).toEqual({ player: "juan", score: 1 });
    game = nextTrivia(game, start + 20_000);
    expect(game).toMatchObject({ index: 1, phase: "question", answers: {} });
    for (let i = 1; i < game.order.length; i++) game = nextTrivia(revealTrivia(game), start);
    expect(game.phase).toBe("done");
  });
});

describe("YouTube watch party", () => {
  it("parses common link shapes", () => {
    for (const link of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10",
      "https://youtu.be/dQw4w9WgXcQ",
      "youtube.com/shorts/dQw4w9WgXcQ",
      "https://m.youtube.com/embed/dQw4w9WgXcQ",
      "dQw4w9WgXcQ",
    ]) {
      expect(parseYouTubeId(link)).toBe("dQw4w9WgXcQ");
    }
    expect(parseYouTubeId("https://evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseYouTubeId("javascript:alert(1)")).toBeNull();
  });

  it("uses the privacy-enhanced player and computes the shared position", () => {
    expect(youtubeEmbedUrl("dQw4w9WgXcQ", "https://diskarte.ph")).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?.*enablejsapi=1/);
    const state = { videoId: "dQw4w9WgXcQ", playing: true, position: 10, at: 1000 };
    expect(expectedPosition(state, 6000)).toBe(15);
    expect(expectedPosition({ ...state, playing: false }, 6000)).toBe(10);
    expect(needsResync(14.5, state, 6000)).toBe(false);
    expect(needsResync(20, state, 6000)).toBe(true);
    expect(isWatchState(state)).toBe(true);
    expect(isWatchState({ ...state, videoId: "<img>" })).toBe(false);
    expect(JSON.parse(playerCommand("seekTo", [3, true]))).toEqual({ event: "command", func: "seekTo", args: [3, true] });
  });
});

describe("activity sync", () => {
  const base: Activity = { id: "a1", host: "h", rev: 1, author: "h", game: { kind: "tictactoe", state: newTicTacToe("h") } };

  it("keeps the newest snapshot and breaks ties deterministically", () => {
    const next = bump(base, { kind: "tictactoe", state: joinTicTacToe(base.game.state as TicTacToe, "p") }, "p");
    expect(next.rev).toBe(2);
    expect(reduceActivity(next, { type: "state", activity: base })).toBe(next); // stale ignored
    expect(reduceActivity(base, { type: "state", activity: next })).toBe(next);
    expect(isNewer({ rev: 2, author: "b" }, { rev: 2, author: "a" })).toBe(true);
    expect(isNewer({ rev: 2, author: "a" }, { rev: 2, author: "b" })).toBe(false);
  });

  it("ends only the matching activity", () => {
    expect(reduceActivity(base, { type: "end", id: "other", rev: 9 })).toBe(base);
    expect(reduceActivity(base, { type: "end", id: "a1", rev: 2 })).toBeNull();
  });

  it("validates messages from the data channel", () => {
    expect(parseActivityMessage({ type: "state", activity: base })).toEqual({ type: "state", activity: base });
    expect(parseActivityMessage({ type: "state", activity: { ...base, game: { kind: "tictactoe", state: { board: [] } } } })).toBeNull();
    expect(parseActivityMessage({ type: "sync-request" })).toEqual({ type: "sync-request" });
    expect(parseActivityMessage({ type: "hack" })).toBeNull();
  });
});

describe("friends & DMs", () => {
  const row = (low: string, high: string, by: string, status: "pending" | "accepted"): Friendship => ({
    user_low: low,
    user_high: high,
    requested_by: by,
    status,
    created_at: "2026-09-27T00:00:00Z",
    accepted_at: status === "accepted" ? "2026-09-27T01:00:00Z" : null,
  });

  it("classifies friendships from my point of view", () => {
    const entries = classifyFriendships([row("a", "me", "a", "pending"), row("me", "z", "me", "pending"), row("b", "me", "b", "accepted")], "me");
    expect(entries).toEqual([
      { userId: "a", status: "incoming", since: "2026-09-27T00:00:00Z" },
      { userId: "z", status: "outgoing", since: "2026-09-27T00:00:00Z" },
      { userId: "b", status: "accepted", since: "2026-09-27T01:00:00Z" },
    ]);
  });

  it("titles, unread state and ordering for conversations", () => {
    const p = (name: string) => ({ id: name, username: name, display_name: name, avatar_url: null, avatar_preset: "araw" });
    expect(conversationTitle({ kind: "direct", name: null, others: [p("Juan")] })).toBe("Juan");
    expect(conversationTitle({ kind: "group", name: "Squad", others: [p("A"), p("B")] })).toBe("Squad");
    expect(conversationTitle({ kind: "group", name: null, others: [p("A"), p("B"), p("C"), p("D")] })).toBe("A, B, C +1");
    expect(isUnread({ lastMessageAt: "2026-09-27T02:00:00Z", lastReadAt: "2026-09-27T01:00:00Z" })).toBe(true);
    expect(isUnread({ lastMessageAt: "2026-09-27T01:00:00Z", lastReadAt: "2026-09-27T01:00:00Z" })).toBe(false);
    expect(sortConversations([{ lastMessageAt: "1" }, { lastMessageAt: "3" }, { lastMessageAt: "2" }]).map((c) => c.lastMessageAt)).toEqual(["3", "2", "1"]);
  });
});
