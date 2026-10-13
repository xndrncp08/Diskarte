// @vitest-environment node
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VisitBeacon } from "@/components/VisitBeacon";
import { RuntimeConfigProvider } from "@/components/providers/RuntimeConfig";

describe("VisitBeacon", () => {
  // It sits in the root layout: touching `window` while rendering on the server takes down every page.
  it("renders on the server", () => {
    const config = { supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon", livekitUrl: "wss://x", siteUrl: "https://x" };
    expect(() =>
      renderToString(
        <RuntimeConfigProvider value={config}>
          <VisitBeacon />
        </RuntimeConfigProvider>,
      ),
    ).not.toThrow();
  });
});
