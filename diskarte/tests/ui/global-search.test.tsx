import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../fixtures/fake-supabase";
import { navigation } from "../mocks/navigation";
import { MEMBER_ID, SERVER_ID, server } from "../fixtures/server";
import type { ReactNode } from "react";

const fake = createFakeSupabase({ profiles: [{ id: MEMBER_ID, username: "juan" }] });
vi.mock("@/components/providers/RuntimeConfig", () => ({ useSupabase: () => fake.client, useOptionalSupabase: () => fake.client }));
vi.mock("@/components/social/HomeSidebar", () => ({ HomeSidebar: () => null }));
vi.mock("@/components/workspace/WorkspacePanel", () => ({ WorkspacePanel: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/shell/ShellUI", () => ({ useShellUI: () => ({ setNavOpen: vi.fn() }) }));

const { GlobalSearchView } = await import("@/components/shell/GlobalSearchView");
const { MessageContext } = await import("@/components/chat/MessageContext");
const id = "70000000-0000-4000-8000-000000000010";

describe("global search", () => {
  it("passes date, sender and media filters and links the exact message", async () => {
    const user = userEvent.setup();
    vi.mocked(fake.client.rpc).mockResolvedValue({ data: [{ source: "channel", id, server_id: SERVER_ID, channel_id: id, content: "Adobo", created_at: "2026-10-13T00:00:00Z" }], error: null } as never);
    render(<GlobalSearchView servers={[server]} />);
    await user.type(screen.getByRole("searchbox"), "adobo");
    await user.type(screen.getByLabelText("Sender username"), "juan");
    await user.selectOptions(screen.getByLabelText("Media"), "image");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(fake.client.rpc).toHaveBeenCalledWith("search_all_messages", expect.objectContaining({ p_query: "adobo", p_author: MEMBER_ID, p_kind: "image" })));
    expect(await screen.findByRole("link", { name: /Open message in context/ })).toHaveAttribute("href", `/tambayan/${SERVER_ID}/${id}?message=${id}`);
  });

  it("rejects invalid links before querying and explains inaccessible messages", async () => {
    navigation.set("/tambayan/messages?message=invalid");
    const first = render(<MessageContext conversationId={id} />);
    expect(await screen.findByText("This message link is invalid.")).toBeInTheDocument();
    first.unmount();
    navigation.set(`/tambayan/dm/${id}?message=${id}`);
    render(<MessageContext conversationId={id} />);
    expect(await screen.findByText("This message was deleted or you no longer have access.")).toBeInTheDocument();
    expect(screen.queryByText("Adobo")).toBeNull();
  });
});
