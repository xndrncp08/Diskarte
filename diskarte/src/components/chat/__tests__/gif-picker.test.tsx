import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GifPicker } from "../GifPicker";

afterEach(() => vi.unstubAllGlobals());

describe("GifPicker", () => {
  it("shows trending, searches, and sends the picked GIF", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const q = new URL(url, "https://d.test").searchParams.get("q");
      return Response.json({ gifs: [{ id: q || "t", title: q ? `Result ${q}` : "Trending", preview: "https://media.giphy.com/p.webp", width: 200, height: 150, url: `https://media.giphy.com/media/${q || "t"}/giphy.gif` }], next: null });
    });
    vi.stubGlobal("fetch", fetchMock);
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(<GifPicker onPick={onPick} />);
    await user.click(screen.getByRole("button", { name: "Send a GIF" }));
    expect(await screen.findByRole("button", { name: "Trending" })).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: "Search GIFs" }), "pusa");
    await user.click(await screen.findByRole("button", { name: "Result pusa" }, { timeout: 2000 }));
    expect(onPick).toHaveBeenCalledWith("https://media.giphy.com/media/pusa/giphy.gif");
  });

  it("explains when GIF search isn't configured", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    const user = userEvent.setup();
    render(<GifPicker onPick={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Send a GIF" }));
    await waitFor(() => expect(screen.getByText(/GIF search isn.t set up/)).toBeInTheDocument());
  });
});
