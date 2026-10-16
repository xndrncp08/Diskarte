import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

let pathname = "/tambayan/messages";
const openSettings = vi.fn();
const call = { target: null as null | { kind: "channel"; serverId: string; serverName: string; channelId: string; channelName: string }, status: "idle", muted: false, toggleMute: vi.fn(), leave: vi.fn() };
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/components/profile/SettingsDialog", () => ({ useSettingsDialog: () => ({ openSettings }) }));
vi.mock("@/components/providers/SocialProvider", () => ({ useOptionalSocial: () => ({ attention: 3 }) }));
vi.mock("@/components/voice/CallProvider", () => ({ useCall: () => call, callHref: (t: { serverId: string; channelId: string }) => `/tambayan/${t.serverId}/${t.channelId}` }));
vi.mock("../ShellUI", () => ({ useShellUI: () => ({ navOpen: false, setNavOpen: vi.fn() }) }));

const { MobileNavigation } = await import("../MobileNavigation");

describe("mobile bottom navigation", () => {
  it("marks the current tab, shows unread DMs, and opens your profile", async () => {
    const user = userEvent.setup();
    render(<MobileNavigation />);
    expect(screen.getByRole("navigation", { name: "Main destinations" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Messages/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Home/ })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: /Messages/ })).toHaveTextContent("3");
    expect(screen.getByRole("link", { name: /Explore/ })).toHaveAttribute("href", "/tambayan/explore");
    await user.click(screen.getByRole("button", { name: /Profile/ }));
    expect(openSettings).toHaveBeenCalledWith("profile");
    expect(screen.queryByTestId("mobile-call-strip")).toBeNull();
  });

  it("gives conversations the whole screen: no tabs inside a DM or channel", () => {
    pathname = "/tambayan/dm/abc";
    const { container } = render(<MobileNavigation />);
    expect(container).toBeEmptyDOMElement();
    pathname = "/tambayan/s1/general";
    render(<MobileNavigation />);
    expect(screen.queryByRole("navigation", { name: "Main destinations" })).toBeNull();
  });

  it("keeps the call one tap away while browsing, even inside a conversation", async () => {
    pathname = "/tambayan/s1/general";
    call.target = { kind: "channel", serverId: "s1", serverName: "Barkada", channelId: "v1", channelName: "Tambayan 1" };
    call.status = "connected";
    const user = userEvent.setup();
    render(<MobileNavigation />);
    expect(screen.getByRole("link", { name: /Tambayan 1/ })).toHaveAttribute("href", "/tambayan/s1/v1");
    await user.click(screen.getByRole("button", { name: "Mute call" }));
    expect(call.toggleMute).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Leave call" }));
    expect(call.leave).toHaveBeenCalled();
  });
});
