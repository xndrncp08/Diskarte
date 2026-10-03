import { memo } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { Glyph } from "@/components/ui/Glyph";
import { splitGlyphs } from "@/lib/emoji";

const SAFE_PROTOCOLS = /^(https?:|mailto:)/i;

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

/**
 * Remark plugin: raw HTML in a message (`<script>…`, `<b>…`) becomes a literal text node, so React
 * escapes it and people see exactly what they typed — it is never parsed or executed.
 */
export function remarkHtmlAsText() {
  const walk = (node: MdNode) => {
    if (node.type === "html") node.type = "text";
    node.children?.forEach(walk);
  };
  return (tree: MdNode) => walk(tree);
}

/**
 * Remark plugin: `:petmalu:`-style codes in text become `glyph` elements, rendered as vector icons —
 * never emoji. Code spans and blocks aren't text nodes, so `:code:` there stays literal.
 */
export function remarkGlyphs() {
  const walk = (node: MdNode) => {
    if (!node.children) return;
    const next: MdNode[] = [];
    for (const child of node.children) {
      if (child.type === "text" && child.value?.includes(":")) {
        for (const part of splitGlyphs(child.value)) {
          next.push(typeof part === "string" ? { type: "text", value: part } : { type: "glyph", data: { hName: "glyph", hProperties: { code: part.code } } });
        }
      } else {
        walk(child);
        next.push(child);
      }
    }
    node.children = next;
  };
  return (tree: MdNode) => walk(tree);
}

/** Only http(s)/mailto links survive; everything else (javascript:, data:, relative) is dropped. */
export function safeUrl(url: string): string {
  const cleaned = defaultUrlTransform(url);
  return SAFE_PROTOCOLS.test(cleaned) ? cleaned : "";
}

const components = {
  glyph: ({ node }: { node?: { properties?: { code?: unknown } } }) => <Glyph code={String(node?.properties?.code ?? "")} label className="size-[1.25em]" />,
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) =>
    href ? (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
} as Components;

/**
 * Chat Markdown (GFM + syntax highlighting). XSS-safe by construction: raw HTML is shown as literal
 * text (skipHtml stays on as a backstop), images are unwrapped (files go through attachments), and
 * URLs are protocol-allow-listed.
 */
export const MessageMarkdown = memo(function MessageMarkdown({ content }: { content: string }) {
  return (
    <div className="chat-markdown text-[15px] text-slate-200">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkHtmlAsText, remarkGlyphs]}
        rehypePlugins={[[rehypeHighlight, { detect: false }]]}
        skipHtml
        disallowedElements={["img", "iframe", "script", "style"]}
        unwrapDisallowed
        urlTransform={safeUrl}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
