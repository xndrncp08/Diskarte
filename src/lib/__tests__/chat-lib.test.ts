import { afterEach, describe, expect, it, vi } from "vitest";
import { isValidReaction, PINOY_REACTIONS, reactionDisplay, renderShortcodes } from "@/lib/emoji";
import { attachmentPrefix, parseAttachments, previewText } from "@/lib/messages";
import { playSfx, SFX_NAMES, setSfxEnabled, sfxEnabled } from "@/lib/sfx";
import { safeFileName, validateAttachment } from "@/lib/uploads";

describe("emoji", () => {
  it("keeps every custom reaction valid for the database check", () => {
    for (const r of PINOY_REACTIONS) {
      expect(r.code).toMatch(/^(:[a-z0-9_]{2,32}:|[^\s]{1,16})$/);
      expect(isValidReaction(r.code)).toBe(true);
    }
    expect(isValidReaction("👍")).toBe(true);
    expect(isValidReaction(":not_real:")).toBe(false);
    expect(isValidReaction("<script>")).toBe(false);
  });

  it("describes reactions", () => {
    expect(reactionDisplay(":petmalu:")).toEqual({ emoji: "🔥", label: "Petmalu", custom: true });
    expect(reactionDisplay("😂")).toEqual({ emoji: "😂", label: "😂", custom: false });
  });

  it("renders shortcodes outside code", () => {
    expect(renderShortcodes("Tara :canton: `:canton:`\n```\n:lodi:\n```")).toBe("Tara 🍜 `:canton:`\n```\n:lodi:\n```");
    expect(renderShortcodes(":unknown: stays")).toBe(":unknown: stays");
  });
});

describe("messages helpers", () => {
  it("builds attachment prefixes and filters malformed attachments", () => {
    expect(attachmentPrefix("s", "c", "u")).toBe("s/c/u/");
    expect(parseAttachments([{ path: "s/c/u/a.png", name: "a.png", size: 1, type: "image/png" }, { path: "../x" }, "nope"])).toHaveLength(1);
    expect(parseAttachments(null)).toEqual([]);
  });

  it("creates plain-text previews", () => {
    expect(previewText("**Hello** _there_\n```ts\nconst x = 1\n```\n> quote [link](https://x.y)")).toBe("Hello there [code] quote link");
    expect(previewText("a".repeat(200), 10)).toBe("aaaaaaaaa…");
  });
});

describe("uploads", () => {
  it("sanitises file names", () => {
    expect(safeFileName("../../etc/passwd")).toBe("etcpasswd");
    expect(safeFileName("My Résumé (final).pdf")).toBe("My-Resume-final.pdf");
    expect(safeFileName("<>")).toBe("file");
  });

  it("rejects empty, huge and active-content files", () => {
    expect(validateAttachment(new File([], "empty.txt"))).toMatch(/walang laman/);
    expect(validateAttachment(new File(["<svg/>"], "x.svg", { type: "image/svg+xml" }))).toMatch(/hindi pwede/);
    const big = new File(["x"], "big.bin");
    Object.defineProperty(big, "size", { value: 26 * 1024 * 1024 });
    expect(validateAttachment(big)).toMatch(/25 MB/);
    expect(validateAttachment(new File(["hi"], "notes.txt", { type: "text/plain" }))).toBeNull();
  });
});

describe("sfx", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setSfxEnabled(true);
  });

  it("synthesises every cue with oscillators", () => {
    const started: number[] = [];
    class FakeAudioContext {
      currentTime = 0;
      state = "running";
      destination = {};
      createOscillator() {
        return { type: "", frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (g: unknown) => g, start: (t: number) => started.push(t), stop: vi.fn() };
      }
      createGain() {
        return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() };
      }
      resume = vi.fn();
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
    for (const name of SFX_NAMES) playSfx(name);
    expect(started.length).toBeGreaterThanOrEqual(SFX_NAMES.length);
  });

  it("can be muted", () => {
    setSfxEnabled(false);
    expect(sfxEnabled()).toBe(false);
    setSfxEnabled(true);
    expect(sfxEnabled()).toBe(true);
  });
});
