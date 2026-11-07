/**
 * Builds the public Help Center content from the Markdown in docs/ (and CHANGELOG.md):
 *   - src/content/docs-site.json            pre-rendered HTML, headings and navigation (server-only)
 *   - public/docs-assets/search-index.json  section-level search entries (fetched by the search dialog)
 *
 * Only pages listed in docs/site.json are published; everything else stays in the repository.
 * Rendering happens here, at authoring time, so /docs pages ship no Markdown parser or highlighter.
 * The output is committed (the app folder must build on its own) and checked by tests/docs.
 *
 *   npm run docs:site            # rewrite both files
 *   npm run docs:site -- --check # exit 1 if either is stale
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";
import { visit, SKIP } from "unist-util-visit";
import type { Root as MdRoot, Html } from "mdast";
import type { Root, Element, ElementContent, Text, RootContent } from "hast";

const APP = path.resolve(import.meta.dirname, "..");
const ROOT = path.resolve(APP, "..");
export const CONTENT_OUT = path.join(APP, "src/content/docs-site.json");
export const SEARCH_OUT = path.join(APP, "public/docs-assets/search-index.json");
export const MANIFEST = path.join(ROOT, "docs/site.json");
export const REPO_URL = "https://github.com/xndrncp08/Diskarte";

export interface ManifestPage { source: string; slug: string; title?: string; reviewed?: string }
export interface Manifest { reviewed: string; sections: { id: string; title: string; audience: string; pages: ManifestPage[] }[]; internal: string[] }
export interface DocHeading { id: string; text: string; depth: 2 | 3 }
export interface DocPage { slug: string; title: string; description: string; section: string; source: string; reviewed: string; headings: DocHeading[]; html: string }
export interface SearchEntry { s: string; a: string; p: string; c: string; h: string; t: string }

/** GitHub's heading ids (kept identical to tests/docs so links keep their anchors). */
export function headingSlug(text: string) {
  return text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
}

function textOf(node: ElementContent | RootContent | Root): string {
  if (node.type === "text") return node.value;
  if ("children" in node) return (node.children as ElementContent[]).map(textOf).join("");
  return "";
}

const el = (tagName: string, properties: Element["properties"], children: ElementContent[] = []): Element => ({ type: "element", tagName, properties, children });
const txt = (value: string): Text => ({ type: "text", value });

/** Raw HTML isn't rendered on the site (remark-rehype would drop it silently), so refuse it outright. */
function remarkNoHtml(file: string) {
  return (tree: MdRoot) => {
    visit(tree, "html", (node: Html) => {
      throw new Error(`${file}: raw HTML isn't supported on the docs site (${node.value.slice(0, 60)})`);
    });
  };
}

/** ```mermaid fences become a container the browser renders lazily; the source stays readable without JS. */
function rehypeMermaid() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      const code = node.tagName === "pre" ? node.children[0] : null;
      if (!parent || index === undefined || code?.type !== "element" || !((code.properties.className as string[] | undefined) ?? []).includes("language-mermaid")) return;
      parent.children[index] = el("figure", { className: ["docs-mermaid"], dataMermaid: "" }, [el("pre", { className: ["docs-mermaid-source"] }, [txt(textOf(code))])]);
      return SKIP;
    });
  };
}

interface Context { file: string; published: Map<string, string>; titles: Map<string, string>; headings: DocHeading[]; images: Map<string, { width: number; height: number }> }

/** Ids on every heading (duplicates get -1, -2…), a permalink, and HTTP method badges in API headings. */
function rehypeHeadings(ctx: Context) {
  return (tree: Root) => {
    const seen = new Map<string, number>();
    visit(tree, "element", (node: Element) => {
      const depth = /^h([1-6])$/.exec(node.tagName)?.[1];
      if (!depth) return;
      const text = textOf(node);
      const base = headingSlug(text);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      const id = String(node.properties.id ?? (n ? `${base}-${n}` : base));
      node.properties.id = id;
      if (depth === "2" || depth === "3") ctx.headings.push({ id, text: text.trim(), depth: Number(depth) as 2 | 3 });
      const only = node.children.length === 1 ? node.children[0] : null;
      const method = only?.type === "element" && only.tagName === "code" ? /^((?:GET|POST|PUT|PATCH|DELETE|HEAD)(?:\/(?:GET|POST|PUT|PATCH|DELETE|HEAD))*) (\/\S*)$/.exec(textOf(only)) : null;
      if (method) {
        node.children = [el("span", { className: ["docs-method", `docs-method-${method[1].split("/")[0].toLowerCase()}`] }, [txt(method[1])]), txt(" "), el("code", {}, [txt(method[2])])];
      }
      if (depth !== "1") node.children.push(el("a", { className: ["docs-anchor"], href: `#${id}`, ariaLabel: `Link to “${text.trim()}”` }, [txt("#")]));
    });
  };
}

/** Published .md → /docs/<slug>; other repository files → GitHub; images under diskarte/public → their URL. */
function rehypeLinks(ctx: Context) {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      const attr = node.tagName === "a" ? "href" : node.tagName === "img" ? "src" : null;
      const value = attr ? node.properties[attr] : null;
      if (!attr || typeof value !== "string") return;
      if (/^(https?:|mailto:)/.test(value)) {
        if (attr === "href") Object.assign(node.properties, { rel: "noopener noreferrer", target: "_blank" });
        return;
      }
      if (value.startsWith("#")) return;
      const [rawPath, anchor] = value.split("#");
      const repoPath = path.relative(ROOT, path.resolve(path.dirname(path.join(ROOT, ctx.file)), decodeURI(rawPath)));
      const hash = anchor ? `#${anchor}` : "";
      if (!fs.existsSync(path.join(ROOT, repoPath))) throw new Error(`${ctx.file}: link to missing ${value}`);
      if (attr === "src") {
        if (!repoPath.startsWith("diskarte/public/")) throw new Error(`${ctx.file}: images must live in diskarte/public (${value})`);
        const url = `/${repoPath.slice("diskarte/public/".length)}`;
        const size = ctx.images.get(repoPath);
        Object.assign(node.properties, { src: url, loading: "lazy", decoding: "async", ...(size ?? {}), ...(/-mobile\./.test(url) ? { className: ["docs-shot-phone"] } : {}) });
        return;
      }
      const slug = ctx.published.get(repoPath);
      // "[voice-and-video.md](voice-and-video.md)" reads well on GitHub; on the site show the page title.
      if (slug !== undefined && /^[\w./-]+\.md$/.test(textOf(node).trim())) node.children = [txt(ctx.titles.get(slug) ?? textOf(node))];
      if (slug !== undefined) node.properties.href = `/docs/${slug}${hash}`.replace(/\/$/, "");
      else {
        const kind = fs.statSync(path.join(ROOT, repoPath)).isDirectory() ? "tree" : "blob";
        Object.assign(node.properties, { href: `${REPO_URL}/${kind}/main/${repoPath.split(path.sep).join("/")}${hash}`, rel: "noopener noreferrer", target: "_blank" });
      }
    });
  };
}

const LANG_LABEL: Record<string, string> = { bash: "Terminal", sh: "Terminal", shell: "Terminal", ts: "TypeScript", tsx: "TSX", sql: "SQL", json: "JSON", http: "HTTP", ini: "Env", text: "Text", js: "JavaScript", mjs: "JavaScript" };

/** Code blocks get a language label and a copy button (one delegated listener handles them all); tables scroll on their own. */
function rehypeChrome() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (!parent || index === undefined) return;
      if (node.tagName === "pre" && node.children[0]?.type === "element" && node.children[0].tagName === "code") {
        const classes = (node.children[0].properties.className as string[] | undefined) ?? [];
        const lang = classes.find((c) => c.startsWith("language-"))?.slice(9) ?? "text";
        // Long lines scroll horizontally, so keyboard users must be able to focus the block.
        Object.assign(node.properties, { tabIndex: 0, ariaLabel: `${LANG_LABEL[lang] ?? lang} code` });
        parent.children[index] = el("div", { className: ["docs-code"] }, [
          el("div", { className: ["docs-code-bar"] }, [el("span", {}, [txt(LANG_LABEL[lang] ?? lang.toUpperCase())]), el("button", { type: "button", className: ["docs-copy"], dataCopy: "" }, [txt("Copy")])]),
          node,
        ]);
        return SKIP;
      }
      if (node.tagName === "table") {
        parent.children[index] = el("div", { className: ["docs-table"], tabIndex: 0, role: "region", ariaLabel: "Table (scrolls horizontally)" }, [node]);
        return SKIP;
      }
    });
  };
}

/** Splits a rendered page into searchable sections (intro + every h2/h3), before chrome is added. */
function sections(tree: Root, page: { slug: string; title: string; section: string }): SearchEntry[] {
  const out: SearchEntry[] = [];
  let current: SearchEntry = { s: page.slug, a: "", p: page.title, c: page.section, h: page.title, t: "" };
  for (const node of tree.children) {
    if (node.type === "element" && /^h[23]$/.test(node.tagName)) {
      out.push(current);
      current = { s: page.slug, a: String(node.properties.id), p: page.title, c: page.section, h: textOf(node).replace(/#$/, "").trim(), t: "" };
    } else if (node.type === "element" && node.tagName !== "h1") {
      current.t += ` ${textOf(node)}`;
    }
  }
  out.push(current);
  return out.map((e) => ({ ...e, t: e.t.replace(/\s+/g, " ").trim().slice(0, 1500) })).filter((e) => e.t || e.a);
}

async function imageSizes() {
  const dir = path.join(APP, "public/docs-assets");
  const sizes = new Map<string, { width: number; height: number }>();
  const walk = (d: string): string[] => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : []);
  for (const file of walk(dir).filter((f) => /\.(webp|png|jpe?g|gif)$/.test(f))) {
    const meta = await sharp(file).metadata();
    if (meta.width && meta.height) sizes.set(path.relative(ROOT, file), { width: meta.width, height: meta.height });
  }
  return sizes;
}

export async function build() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as Manifest;
  const published = new Map(manifest.sections.flatMap((s) => s.pages.map((p) => [p.source, p.slug] as const)));
  const images = await imageSizes();
  const titles = new Map(manifest.sections.flatMap((s) => s.pages.map((p) => [p.slug, p.title ?? /^# (.+)$/m.exec(fs.readFileSync(path.join(ROOT, p.source), "utf8"))?.[1] ?? p.slug] as const)));
  const pages: Record<string, DocPage> = {};
  const search: SearchEntry[] = [];

  for (const section of manifest.sections) {
    for (const entry of section.pages) {
      const markdown = fs.readFileSync(path.join(ROOT, entry.source), "utf8");
      const ctx: Context = { file: entry.source, published, titles, headings: [], images };
      const processor = unified().use(remarkParse).use(remarkGfm).use(remarkNoHtml, entry.source).use(remarkRehype).use(rehypeMermaid)
        .use(rehypeHeadings, ctx).use(rehypeLinks, ctx).use(rehypeHighlight, { detect: false });
      const tree = (await processor.run(processor.parse(markdown))) as Root;
      const h1 = tree.children.find((n): n is Element => n.type === "element" && n.tagName === "h1");
      const title = entry.title ?? (h1 ? textOf(h1).trim() : entry.slug);
      tree.children = tree.children.filter((n) => n !== h1);
      const firstParagraph = tree.children.find((n): n is Element => n.type === "element" && n.tagName === "p");
      const description = (firstParagraph ? textOf(firstParagraph) : "").replace(/\s+/g, " ").trim().slice(0, 200);
      search.push(...sections(tree, { slug: entry.slug, title, section: section.title }));
      rehypeChrome()(tree);
      const html = unified().use(rehypeStringify).stringify(tree);
      pages[entry.slug] = { slug: entry.slug, title, description, section: section.id, source: entry.source, reviewed: entry.reviewed ?? manifest.reviewed, headings: ctx.headings, html };
    }
  }

  const changelog = fs.readFileSync(path.join(APP, "CHANGELOG.md"), "utf8");
  const content = {
    version: JSON.parse(fs.readFileSync(path.join(APP, "package.json"), "utf8")).version as string,
    latestRelease: /^## (\d{4}-\d{2}-\d{2})/m.exec(changelog)?.[1] ?? null,
    reviewed: manifest.reviewed,
    sections: manifest.sections.map((s) => ({ id: s.id, title: s.title, audience: s.audience, pages: s.pages.map((p) => p.slug) })),
    pages,
  };
  return { content: `${JSON.stringify(content)}\n`, search: `${JSON.stringify(search)}\n` };
}

/** Markdown files under docs/ that the manifest neither publishes nor marks internal (each must be one). */
export function unclassified(manifest: Manifest) {
  const listed = new Set([...manifest.sections.flatMap((s) => s.pages.map((p) => p.source)), ...manifest.internal]);
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "docs"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter((f) => f.endsWith(".md"));
  return files.filter((f) => !listed.has(f));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const { content, search } = await build();
  const stale = [[CONTENT_OUT, content], [SEARCH_OUT, search]].filter(([file, text]) => !fs.existsSync(file) || fs.readFileSync(file, "utf8") !== text);
  if (process.argv.includes("--check")) {
    if (stale.length) {
      console.error(`Stale: ${stale.map(([f]) => path.relative(ROOT, f)).join(", ")}. Run \`npm run docs:site --prefix diskarte\`.`);
      process.exit(1);
    }
    console.log("Help Center content is up to date.");
  } else {
    for (const [file, text] of [[CONTENT_OUT, content], [SEARCH_OUT, search]]) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
    }
    const missing = unclassified(JSON.parse(fs.readFileSync(MANIFEST, "utf8")));
    if (missing.length) console.warn(`Not classified in docs/site.json: ${missing.join(", ")}`);
    console.log(`Wrote ${path.relative(ROOT, CONTENT_OUT)} (${(content.length / 1024).toFixed(0)} KB) and ${path.relative(ROOT, SEARCH_OUT)} (${(search.length / 1024).toFixed(0)} KB).`);
  }
}
