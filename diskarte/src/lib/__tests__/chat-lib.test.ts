import { afterEach, describe, expect, it, vi } from "vitest";
import { CLASSIC_REACTIONS, isValidReaction, PINOY_REACTIONS, splitGlyphs } from "@/lib/emoji";
import { glyphLabel, toGlyphCode } from "@/lib/glyphs";
import { attachmentPrefix, parseAttachments, previewText } from "@/lib/messages";
import { playSfx, SFX_NAMES, setSfxEnabled, sfxEnabled } from "@/lib/sfx";
import { safeFileName, sniffMatches, validateAttachment } from "@/lib/uploads";

describe("reactions and glyphs (no emoji, ever)", () => {
  it("keeps every reaction a glyph code valid for the database check", () => {
    for (const r of [...PINOY_REACTIONS, ...CLASSIC_REACTIONS]) {
      expect(r.code).toMatch(/^:[a-z0-9_]{1,32}:$/);
      expect(isValidReaction(r.code)).toBe(true);
    }
    // New reactions can't be emoji or unknown codes.
    expect(isValidReaction("👍")).toBe(false);
    expect(isValidReaction(":not_real:")).toBe(false);
    expect(isValidReaction("<script>")).toBe(false);
  });

  it("maps codes and legacy stored emoji to icon codes, never back to emoji", () => {
    expect(toGlyphCode(":petmalu:")).toBe(":petmalu:");
    expect(toGlyphCode("🍜")).toBe(":canton:");
    expect(toGlyphCode("👍")).toBe(":thumbs_up:");
    expect(toGlyphCode("🦖")).toBe(":sparkle:"); // anything unknown still renders as an icon
    expect(glyphLabel("🔥")).toBe("Petmalu");
    expect(toGlyphCode(null)).toBeNull();
  });

  it("splits known glyph codes out of text and leaves unknown ones alone", () => {
    expect(splitGlyphs("Tara :canton: na! :unknown:")).toEqual(["Tara ", { code: ":canton:" }, " na! :unknown:"]);
  });
});

describe("messages helpers", () => {
  it("builds attachment prefixes and filters malformed attachments", () => {
    expect(attachmentPrefix("s", "c", "u")).toBe("s/c/u/");
    const ok = { path: "11111111-2222-4333-8444-555555555555/11111111-2222-4333-8444-555555555555/11111111-2222-4333-8444-555555555555/11111111-2222-4333-8444-555555555555.png", name: "a.png", size: 1, type: "image/png" };
    expect(parseAttachments([ok, { ...ok, path: "s/c/u/a.png" }, { ...ok, type: "text/html" }, { ...ok, size: 11 * 1024 * 1024 }, { path: "../x" }, "nope"])).toHaveLength(1);
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

  it("only allows the MIME allow-list up to 10 MB", () => {
    expect(validateAttachment(new File([], "empty.png", { type: "image/png" }))).toMatch(/is empty/);
    for (const type of ["image/svg+xml", "text/html", "text/plain", "application/pdf", "application/x-msdownload"]) {
      expect(validateAttachment(new File(["x"], "f", { type }))).toMatch(/are allowed/);
    }
    const big = new File(["x"], "big.mp4", { type: "video/mp4" });
    Object.defineProperty(big, "size", { value: 10 * 1024 * 1024 + 1 });
    expect(validateAttachment(big)).toMatch(/10 MB/);
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/gif", "audio/mpeg", "video/mp4"]) {
      expect(validateAttachment(new File(["x"], "f", { type }))).toBeNull();
    }
  });

  it("sniffs magic bytes", () => {
    const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
    const ascii = (s: string, offset = 0) => bytes(...new Array(offset).fill(0), ...Array.from(s, (c) => c.charCodeAt(0)));
    expect(sniffMatches("image/jpeg", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(sniffMatches("image/png", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(true);
    expect(sniffMatches("image/gif", ascii("GIF89a"))).toBe(true);
    expect(sniffMatches("image/webp", new Uint8Array([...Array.from("RIFF", (c) => c.charCodeAt(0)), 0, 0, 0, 0, ...Array.from("WEBP", (c) => c.charCodeAt(0))]))).toBe(true);
    expect(sniffMatches("audio/mpeg", ascii("ID3"))).toBe(true);
    expect(sniffMatches("video/mp4", ascii("ftyp", 4))).toBe(true);
    expect(sniffMatches("image/png", ascii("<svg onload=alert(1)>"))).toBe(false);
    expect(sniffMatches("video/mp4", ascii("<html>"))).toBe(false);
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
