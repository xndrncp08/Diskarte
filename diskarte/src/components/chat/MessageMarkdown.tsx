import { memo, type ReactNode } from "react";
import { CircleCheck, Info, OctagonAlert, TriangleAlert } from "lucide-react";
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

export type CalloutTone = "info" | "success" | "warning" | "critical";

/** GitHub-style alert names and Diskarte's broadcast tones, mapped onto the four callout tones. */
const CALLOUT_TONES: Record<string, CalloutTone> = {
  NOTE: "info",
  INFO: "info",
  TIP: "success",
  SUCCESS: "success",
  IMPORTANT: "warning",
  WARNING: "warning",
  CAUTION: "critical",
  CRITICAL: "critical",
  DANGER: "critical",
};

const CALLOUT_LABEL: Record<CalloutTone, string> = { info: "Info", success: "Success", warning: "Warning", critical: "Critical" };
const CALLOUT_ICON: Record<CalloutTone, ReactNode> = {
  info: <Info className="size-4" aria-hidden />,
  success: <CircleCheck className="size-4" aria-hidden />,
  warning: <TriangleAlert className="size-4" aria-hidden />,
  critical: <OctagonAlert className="size-4" aria-hidden />,
};

/**
 * Remark plugin: a blockquote opening with `[!INFO]`, `[!SUCCESS]`, `[!WARNING]` or `[!CRITICAL]`
 * (or GitHub's NOTE / TIP / IMPORTANT / CAUTION) becomes a glass callout box with an icon and label.
 */
export function remarkCallouts() {
  const walk = (node: MdNode) => {
    node.children?.forEach(walk);
    if (node.type !== "blockquote") return;
    const first = node.children?.[0];
    const lead = first?.type === "paragraph" ? first.children?.[0] : undefined;
    const match = lead?.type === "text" ? /^\[!([A-Za-z]+)\][ \t]*\n?/.exec(lead.value ?? "") : null;
    const tone = match ? CALLOUT_TONES[match[1].toUpperCase()] : undefined;
    if (!first || !lead || !match || !tone) return;
    lead.value = (lead.value ?? "").slice(match[0].length);
    if (!lead.value) first.children = first.children!.slice(1);
    if (first.children?.length === 0) node.children = node.children!.slice(1);
    node.data = { hName: "callout", hProperties: { tone } };
  };
  return (tree: MdNode) => walk(tree);
}

/** Only http(s)/mailto links survive; everything else (javascript:, data:, relative) is dropped. */
export function safeUrl(url: string): string {
  const cleaned = defaultUrlTransform(url);
  return SAFE_PROTOCOLS.test(cleaned) ? cleaned : "";
}

const components = {
  callout: ({ node, children }: { node?: { properties?: { tone?: unknown } }; children?: React.ReactNode }) => {
    const tone = (["info", "success", "warning", "critical"] as const).find((t) => t === node?.properties?.tone) ?? "info";
    return (
      <div className="callout" data-tone={tone} role="note" aria-label={CALLOUT_LABEL[tone]}>
        <p className="callout-title">
          {CALLOUT_ICON[tone]}
          {CALLOUT_LABEL[tone]}
        </p>
        {children}
      </div>
    );
  },
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
 * Chat Markdown (GFM + syntax highlighting + callout boxes). XSS-safe by construction: raw HTML is shown as literal
 * text (skipHtml stays on as a backstop), images are unwrapped (files go through attachments), and
 * URLs are protocol-allow-listed.
 */
export const MessageMarkdown = memo(function MessageMarkdown({ content }: { content: string }) {
  return (
    <div className="chat-markdown text-[15px] text-slate-200">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkHtmlAsText, remarkCallouts, remarkGlyphs]}
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
