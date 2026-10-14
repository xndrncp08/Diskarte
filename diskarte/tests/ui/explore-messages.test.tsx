import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
const rpc = vi.fn(async (_fn: string, args: { p_category?: string | null }) => ({
  data: [
    { id: "s1", name: "Valorant PH", description: "Ranked grind", icon_url: null, category: "gaming", member_count: 120, active_members: 14, is_member: false },
    { id: "s2", name: "Study Buddies", description: "", icon_url: null, category: "study", member_count: 1, active_members: 0, is_member: true },
  ].filter((s) => !args.p_category || s.category === args.p_category),
  error: null,
}));
const joinPublicServerAction = vi.fn(async () => ({ ok: true, data: { serverId: "s1" } }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/tambayan/messages" }));
vi.mock("@/components/providers/RuntimeConfig", () => ({ useSupabase: () => ({ rpc }) }));
vi.mock("@/actions/servers", () => ({ joinPublicServerAction: (i: unknown) => joinPublicServerAction(i as never) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock("@/components/social/HomeSidebar", () => ({
  HomeSidebar: () => null,
  DmRow: ({ conversation }: { conversation: { id: string; name: string } }) => <li>{conversation.name}</li>,
}));
vi.mock("@/components/workspace/WorkspacePanel", () => ({ WorkspacePanel: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/shell/ShellUI", () => ({ useShellUI: () => ({ setNavOpen: vi.fn() }) }));
vi.mock("@/components/providers/SocialProvider", () => ({
  useSocial: () => ({ conversations: [{ id: "c1", name: "Juan", kind: "direct", others: [] }, { id: "c2", name: "Barkada GC", kind: "group", others: [] }], friends: [{ status: "incoming" }] }),
}));
vi.mock("@/lib/social", async (orig) => ({ ...(await orig<typeof import("@/lib/social")>()), conversationTitle: (c: { name: string }) => c.name }));

const { ExploreView } = await import("@/components/shell/ExploreView");
const { MessagesView } = await import("@/components/social/MessagesView");

describe("explore", () => {
  it("lists public servers, filters by category, and joins without an invite", async () => {
    const user = userEvent.setup();
    render(<ExploreView servers={[]} />);
    const list = await screen.findByTestId("explore-results");
    expect(within(list).getByText("Valorant PH")).toBeInTheDocument();
    expect(within(list).getByText(/14 active this week/)).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Study" }));
    await waitFor(() => expect(rpc).toHaveBeenLastCalledWith("discover_servers", expect.objectContaining({ p_category: "study" })));
    await waitFor(() => expect(screen.queryByText("Valorant PH")).toBeNull());
    expect(screen.getByRole("button", { name: "Open Study Buddies" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "All" }));
    await user.click(await screen.findByRole("button", { name: "Join Valorant PH" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/tambayan/s1"));
    expect(joinPublicServerAction).toHaveBeenCalledWith({ serverId: "s1" });
  });
});

describe("messages tab", () => {
  it("lists conversations full-screen with search and the friend request count", async () => {
    const user = userEvent.setup();
    render(<MessagesView servers={[]} />);
    const list = screen.getByTestId("messages-list");
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Juan", "Barkada GC"]);
    expect(screen.getByRole("link", { name: /Friends/ })).toHaveTextContent("1");
    await user.type(screen.getByRole("searchbox", { name: "Search conversations" }), "bark");
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Barkada GC"]);
  });
});
