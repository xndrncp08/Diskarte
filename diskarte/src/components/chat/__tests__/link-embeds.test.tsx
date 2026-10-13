import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DISPLAY_PREFS, setDisplayPrefs } from "@/lib/display-prefs";
import { LinkEmbeds } from "../LinkEmbeds";

afterEach(() => {
  vi.unstubAllGlobals();
  act(() => setDisplayPrefs(DEFAULT_DISPLAY_PREFS));
});

describe("LinkEmbeds", () => {
  it("previews links (title, description, proxied image) and skips suppressed ones", async () => {
    const fetchMock = vi.fn(async (input: string) => {
      const url = new URL(input, "https://diskarte.test").searchParams.get("url");
      return new Response(JSON.stringify({ preview: { url, siteName: "Example", title: `Title for ${url}`, description: "A page", image: "/api/unfurl/image?u=x&s=y", color: "#ff0000" } }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<LinkEmbeds content="look https://example.com/one and <https://example.com/hidden>" />);
    const link = await screen.findByRole("link", { name: "Title for https://example.com/one" });
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow ugc");
    expect(screen.getByTestId("link-embed").querySelector("img")).toHaveAttribute("src", "/api/unfurl/image?u=x&s=y");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows nothing when previews are off in Settings → Chat", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    act(() => setDisplayPrefs({ embeds: false }));
    const { container } = render(<LinkEmbeds content="https://example.com/two" />);
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
