// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generate, OUTPUT } from "../../scripts/generate-db-reference.mjs";

/** Repository root: docs/ and supabase/ live beside diskarte/. */
const ROOT = path.resolve(__dirname, "../../..");
const APP = path.join(ROOT, "diskarte");

function markdownFiles(): string[] {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".md") ? [path.join(dir, e.name)] : []));
  const top = (dir: string) => fs.readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => path.join(dir, f));
  return [...walk(path.join(ROOT, "docs")), ...top(ROOT), ...top(APP), ...walk(path.join(APP, "docs"))];
}

/** GitHub's heading anchors: lower-case, punctuation dropped, spaces → hyphens, duplicates get -1, -2… */
function anchors(markdown: string): Set<string> {
  const seen = new Map<string, number>();
  const ids = new Set<string>();
  for (const [, id] of markdown.matchAll(/<a id="([^"]+)"/g)) ids.add(id);
  for (const line of stripFences(markdown).split("\n")) {
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (!heading) continue;
    const text = heading[1].replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
    const base = text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    ids.add(n ? `${base}-${n}` : base);
  }
  return ids;
}

const stripFences = (markdown: string) => markdown.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1\s*$/gm, "");
const stripCode = (markdown: string) => stripFences(markdown).replace(/`[^`\n]*`/g, "");

/** Relative link targets from Markdown links (one level of nested parentheses, e.g. `app/(app)/x.tsx`) and HTML hrefs/srcs. */
function links(markdown: string): string[] {
  const text = stripCode(markdown);
  const md = [...text.matchAll(/\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g)].map((m) => m[1]);
  const html = [...text.matchAll(/\b(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  return [...md, ...html].filter((t) => !/^(https?:|mailto:|tel:)/.test(t));
}

describe("documentation", () => {
  it("keeps docs/reference/database.md in sync with supabase/migrations", async () => {
    const current = fs.readFileSync(OUTPUT, "utf8");
    expect(current === (await generate()), "Run `npm run docs:db --prefix diskarte` and commit the result.").toBe(true);
  }, 60_000);

  it("has no broken relative links or anchors", () => {
    const broken: string[] = [];
    const cache = new Map<string, Set<string>>();
    for (const file of markdownFiles()) {
      const markdown = fs.readFileSync(file, "utf8");
      for (const target of links(markdown)) {
        const [rawPath, anchor] = target.split("#");
        const resolved = rawPath ? path.resolve(path.dirname(file), decodeURI(rawPath)) : file;
        const where = `${path.relative(ROOT, file)} → ${target}`;
        if (!fs.existsSync(resolved)) {
          broken.push(`${where} (missing file)`);
          continue;
        }
        if (anchor && resolved.endsWith(".md")) {
          if (!cache.has(resolved)) cache.set(resolved, anchors(fs.readFileSync(resolved, "utf8")));
          if (!cache.get(resolved)!.has(anchor)) broken.push(`${where} (missing anchor)`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("documents every environment variable the code reads", () => {
    const sources = ["src", "scripts", "e2e"].flatMap((dir) => {
      const walk = (d: string): string[] =>
        fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === "__tests__" ? [] : walk(path.join(d, e.name))) : /\.(m?[jt]sx?)$/.test(e.name) && !e.name.includes(".test.") ? [path.join(d, e.name)] : []));
      return walk(path.join(APP, dir));
    });
    sources.push(...["next.config.ts", "playwright.config.ts"].map((f) => path.join(APP, f)));
    const names = new Set<string>();
    for (const file of sources) {
      const code = fs.readFileSync(file, "utf8");
      for (const [, name] of code.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) names.add(name);
      for (const [, name] of code.matchAll(/\benv\.([A-Z][A-Z0-9_]{2,})\b/g)) names.add(name);
      for (const [, args] of code.matchAll(/\b(?:pick|envLimit)\(([^)]*)\)/g)) for (const [, name] of args.matchAll(/"([A-Z][A-Z0-9_]+)"/g)) names.add(name);
    }
    for (const line of fs.readFileSync(path.join(APP, ".env.example"), "utf8").split("\n")) {
      const name = /^([A-Z][A-Z0-9_]+)=/.exec(line)?.[1];
      if (name) names.add(name);
    }
    const doc = fs.readFileSync(path.join(ROOT, "docs/reference/environment.md"), "utf8");
    expect([...names].filter((name) => !doc.includes(`\`${name}\``)).sort()).toEqual([]);
  });
});
