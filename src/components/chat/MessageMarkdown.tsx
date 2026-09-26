import { memo } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { renderShortcodes } from "@/lib/emoji";

const SAFE_PROTOCOLS = /^(https?:|mailto:)/i;

/** Only http(s)/mailto links survive; everything else (javascript:, data:, relative) is dropped. */
export function safeUrl(url: string): string {
  const cleaned = defaultUrlTransform(url);
  return SAFE_PROTOCOLS.test(cleaned) ? cleaned : "";
}

const components: Components = {
  a: ({ href, children }) =>
    href ? (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
};

/**
 * Chat Markdown (GFM + syntax highlighting). XSS-safe by construction: raw HTML is skipped,
 * images are unwrapped (files go through attachments), and URLs are protocol-allow-listed.
 */
export const MessageMarkdown = memo(function MessageMarkdown({ content }: { content: string }) {
  return (
    <div className="chat-markdown text-[15px] text-slate-200">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false }]]}
        skipHtml
        disallowedElements={["img", "iframe", "script", "style"]}
        unwrapDisallowed
        urlTransform={safeUrl}
        components={components}
      >
        {renderShortcodes(content)}
      </ReactMarkdown>
    </div>
  );
});
