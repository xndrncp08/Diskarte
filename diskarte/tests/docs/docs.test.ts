// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generate, OUTPUT } from "../../scripts/generate-db-reference.mjs";
import { build, CONTENT_OUT, MANIFEST, SEARCH_OUT, unclassified, type Manifest } from "../../scripts/build-docs-site.mjs";
import { HELP } from "@/lib/docs/help";

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

  it("keeps the Help Center content in sync with the Markdown", async () => {
    const { content, search } = await build();
    const fresh = fs.readFileSync(CONTENT_OUT, "utf8") === content && fs.readFileSync(SEARCH_OUT, "utf8") === search;
    expect(fresh, "Run `npm run docs:site --prefix diskarte` and commit the result.").toBe(true);
  }, 60_000);

  it("classifies every Markdown page in docs/ as published or internal, never both", () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as Manifest;
    const published = manifest.sections.flatMap((s) => s.pages.map((p) => p.source));
    expect(unclassified(manifest)).toEqual([]);
    expect(published.filter((p) => manifest.internal.includes(p))).toEqual([]);
    expect(new Set(manifest.sections.flatMap((s) => s.pages.map((p) => p.slug))).size).toBe(published.length);
  });

  it("publishes no internal pages and nothing that looks like a secret", () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as Manifest;
    const bundle = fs.readFileSync(CONTENT_OUT, "utf8") + fs.readFileSync(SEARCH_OUT, "utf8");
    const sources = (JSON.parse(fs.readFileSync(CONTENT_OUT, "utf8")) as { pages: Record<string, { source: string }> }).pages;
    expect(Object.values(sources).filter((p) => manifest.internal.includes(p.source))).toEqual([]);
    expect(bundle).not.toMatch(/eyJ[\w-]{20,}\.[\w-]{10,}/);
    expect(bundle).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
    expect(bundle).not.toMatch(/(SERVICE_ROLE_KEY|API_SECRET|PRIVATE_KEY|DISPATCH_SECRET)=[A-Za-z0-9_-]{16,}/);
  });

  it("points every in-app help link at a published page and heading", () => {
    const pages = (JSON.parse(fs.readFileSync(CONTENT_OUT, "utf8")) as { pages: Record<string, { html: string }> }).pages;
    const broken = Object.entries(HELP).filter(([, href]) => {
      const [route, anchor] = href.split("#");
      if (route === "/docs") return false;
      const page = pages[route.replace(/^\/docs\//, "")];
      return !page || (anchor !== undefined && !page.html.includes(`id="${anchor}"`));
    });
    expect(broken).toEqual([]);
  });

  it("documents exactly the HTTP methods the route handlers export", () => {
    const api = path.join(APP, "src/app/api");
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name === "route.ts" ? [path.join(d, e.name)] : []));
    const actual = new Set(walk(api).flatMap((file) => {
      const route = `/api/${path.relative(api, path.dirname(file)).split(path.sep).join("/")}`.replace(/\[(\w+)\]/g, "<$1>");
      return [...fs.readFileSync(file, "utf8").matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE|HEAD)\b/g)].map((m) => `${m[1]} ${route}`);
    }));
    const markdown = fs.readFileSync(path.join(ROOT, "docs/reference/api.md"), "utf8");
    const documented = new Set([...markdown.matchAll(/`((?:GET|POST|PUT|PATCH|DELETE|HEAD)(?:\/(?:GET|POST|PUT|PATCH|DELETE|HEAD))*) (\/api\/[^`\s?]+)`/g)].flatMap((m) => m[1].split("/").map((method) => `${method} ${m[2]}`)));
    expect([...actual].filter((e) => !documented.has(e)).sort(), "route handlers missing from docs/reference/api.md").toEqual([]);
    expect([...documented].filter((e) => !actual.has(e)).sort(), "documented endpoints with no handler").toEqual([]);
  });

  it("keeps release notes well-formed, newest first, with links to published pages", async () => {
    const { RELEASES } = await import("@/lib/releases");
    const pages = (JSON.parse(fs.readFileSync(CONTENT_OUT, "utf8")) as { pages: Record<string, { html: string }> }).pages;
    const problems: string[] = [];
    RELEASES.forEach((r, i) => {
      if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]{1,60}$/.test(r.id) || !r.id.startsWith(r.date)) problems.push(`${r.id}: id must be <date>-<slug>`);
      if (i > 0 && r.date > RELEASES[i - 1].date) problems.push(`${r.id}: not newest first`);
      if (!r.title.trim() || r.title.length > 120 || !r.summary.trim()) problems.push(`${r.id}: title/summary`);
      for (const href of [...r.highlights.flatMap((h) => (h.href ? [h.href] : [])), ...r.links.map((l) => l.href)]) {
        if (/^https?:/.test(href)) continue;
        const [route, anchor] = href.split("#");
        const page = route === "/docs" ? { html: "" } : pages[route.replace(/^\/docs\//, "")];
        if (!page || (anchor && !page.html.includes(`id="${anchor}"`))) problems.push(`${r.id}: broken link ${href}`);
      }
    });
    expect(new Set(RELEASES.map((r) => r.id)).size).toBe(RELEASES.length);
    expect(problems).toEqual([]);
  });
});

