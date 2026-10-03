import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageMarkdown, safeUrl } from "@/components/chat/MessageMarkdown";

describe("MessageMarkdown", () => {
  it("renders GFM, code blocks with highlighting and shortcodes", () => {
    const { container } = render(<MessageMarkdown content={"**bold** ~~gone~~ :petmalu:\n\n```ts\nconst x = 1;\n```"} />);
    expect(container.querySelector("strong")).toHaveTextContent("bold");
    expect(container.querySelector("del")).toHaveTextContent("gone");
    // :petmalu: is drawn as a vector icon, not an emoji.
    expect(container.querySelector('[data-glyph=":petmalu:"]')).toHaveAttribute("aria-label", "Petmalu");
    expect(container.textContent).not.toContain(":petmalu:");
    expect(container.querySelector("pre code.hljs")).not.toBeNull();
    expect(container.querySelector(".hljs-keyword")).toHaveTextContent("const");
  });

  it("never renders raw HTML — it shows up as the literal text that was typed", () => {
    const payload = '<img src=x onerror="alert(1)"><script>alert(1)</script><b>hi</b>';
    const { container } = render(<MessageMarkdown content={payload} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain(payload);
  });

  it("drops dangerous link protocols and hardens external links", () => {
    render(<MessageMarkdown content={"[safe](https://diskarte.ph) [bad](javascript:alert(1)) [data](data:text/html,hi)"} />);
    const safe = screen.getByRole("link", { name: "safe" });
    expect(safe).toHaveAttribute("href", "https://diskarte.ph");
    expect(safe).toHaveAttribute("rel", "noopener noreferrer nofollow ugc");
    expect(safe).toHaveAttribute("target", "_blank");
    expect(screen.queryByRole("link", { name: "bad" })).toBeNull();
    expect(screen.queryByRole("link", { name: "data" })).toBeNull();
    expect(screen.getByText("bad")).toBeInTheDocument();
  });

  it("unwraps markdown images instead of loading remote pixels", () => {
    const { container } = render(<MessageMarkdown content={"![tracker](https://evil.example/pixel.gif)"} />);
    expect(container.querySelector("img")).toBeNull();
  });

  it("allow-lists URL protocols", () => {
    expect(safeUrl("https://a.b")).toBe("https://a.b");
    expect(safeUrl("mailto:hi@diskarte.ph")).toBe("mailto:hi@diskarte.ph");
    expect(safeUrl("javascript:alert(1)")).toBe("");
    expect(safeUrl("/relative")).toBe("");
  });
});
