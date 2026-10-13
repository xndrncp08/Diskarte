import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../fixtures/fake-supabase";
import { navigation } from "../mocks/navigation";
import { MEMBER_ID, OWNER_ID, SERVER_ID, ServerFixture, channels, makeMember } from "../fixtures/server";

const fake = createFakeSupabase({});
vi.mock("@/components/providers/RuntimeConfig", () => ({ useSupabase: () => fake.client, useOptionalSupabase: () => fake.client }));
const { SearchBox } = await import("@/components/chat/SearchBox");

const members = [makeMember(OWNER_ID, "Kapitan", "admin"), makeMember(MEMBER_ID, "Juan", "member")];
const hit = { id: "70000000-0000-4000-8000-000000000001", channel_id: channels[1].id, server_id: SERVER_ID, author_id: MEMBER_ID, content: "Adobong manok yung luto ko", created_at: "2026-10-12T08:00:00Z" };

describe("message search", () => {
  it("searches with from: and opens the result's channel", async () => {
    const user = userEvent.setup();
    vi.mocked(fake.client.rpc).mockImplementation((async () => ({ data: [hit], error: null })) as never);
    render(
      <ServerFixture members={members}>
        <main id="main-content" className="relative">
          <SearchBox />
        </main>
      </ServerFixture>,
    );
    await user.type(screen.getByRole("searchbox"), "adobo from:juan{Enter}");
    await waitFor(() =>
      expect(fake.client.rpc).toHaveBeenCalledWith("search_messages", expect.objectContaining({ p_server: SERVER_ID, p_query: "adobo", p_author: MEMBER_ID, p_channel: null })),
    );
    const results = await screen.findByRole("region", { name: "Search results" });
    const result = within(results).getByTestId("search-hit");
    expect(result).toHaveTextContent("Adobong manok");
    expect(result).toHaveTextContent(channels[1].name);
    await user.click(result);
    expect(navigation.path).toBe(`/tambayan/${SERVER_ID}/${channels[1].id}`);
    expect(screen.queryByRole("region", { name: "Search results" })).toBeNull();
  });

  it("explains an unknown name instead of searching", async () => {
    const user = userEvent.setup();
    vi.mocked(fake.client.rpc).mockClear();
    render(
      <ServerFixture members={members}>
        <main id="main-content">
          <SearchBox />
        </main>
      </ServerFixture>,
    );
    await user.type(screen.getByRole("searchbox"), "from:nobody{Enter}");
    expect(await screen.findByText(/Nobody here goes by "nobody"/)).toBeInTheDocument();
    expect(fake.client.rpc).not.toHaveBeenCalled();
  });
});
