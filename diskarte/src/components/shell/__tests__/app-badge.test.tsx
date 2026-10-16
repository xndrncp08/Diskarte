import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let conversations = [{ id: "d1", lastMessageAt: "2026-10-15T10:00:00Z", lastReadAt: "2026-10-15T09:00:00Z" }];
let channels = new Map([["c1", { serverId: "s", lastMessageAt: "2026-10-15T10:00:00Z", readAt: "2026-10-15T09:00:00Z", mentions: 1 }]]);
vi.mock("@/components/providers/SocialProvider", () => ({ useOptionalSocial: () => ({ conversations }) }));
vi.mock("@/components/providers/UnreadsProvider", async (orig) => ({ ...(await orig<typeof import("@/components/providers/UnreadsProvider")>()), useOptionalUnreads: () => ({ channels }) }));
vi.mock("@/components/providers/MeProvider", () => ({ useMe: () => ({ me: { id: "me" } }) }));
vi.mock("@/components/providers/RuntimeConfig", () => ({ useOptionalSupabase: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { AppBadge } = await import("../DmNotifier");

afterEach(() => vi.unstubAllGlobals());

describe("app icon badge", () => {
  it("shows what's unread and clears once everything is read", () => {
    const setAppBadge = vi.fn(async () => undefined);
    const clearAppBadge = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, setAppBadge, clearAppBadge });
    const { rerender } = render(<AppBadge />);
    expect(setAppBadge).toHaveBeenLastCalledWith(2);
    conversations = [{ ...conversations[0], lastReadAt: "2026-10-15T11:00:00Z" }];
    channels = new Map([["c1", { ...channels.get("c1")!, readAt: "2026-10-15T11:00:00Z", mentions: 0 }]]);
    rerender(<AppBadge />);
    expect(clearAppBadge).toHaveBeenCalled();
  });
});
