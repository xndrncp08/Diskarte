import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../fixtures/fake-supabase";
import { MEMBER_ID, MOD_ID, OWNER_ID, SERVER_ID, ServerFixture, makeChannel, makeMember } from "../fixtures/server";
import type { Channel } from "@/lib/servers";

const tables: Record<string, unknown[]> = {};
const fake = createFakeSupabase(tables);
vi.mock("@/components/providers/RuntimeConfig", () => ({ useSupabase: () => fake.client, useOptionalSupabase: () => fake.client }));
vi.mock("@/actions/servers", async () => (await import("../mocks/actions")).serverActions);
vi.mock("sonner", async () => (await import("../mocks/actions")).toastMock);

const { serverActions } = await import("../mocks/actions");
const { RolesSettings } = await import("@/components/server/settings/RolesSettings");
const { ChannelDialog } = await import("@/components/server/ChannelDialog");
const { ConfirmHost } = await import("@/components/ui/ConfirmHost");

const members = [makeMember(OWNER_ID, "Kapitan", "admin"), makeMember(MOD_ID, "Maria", "moderator"), makeMember(MEMBER_ID, "Juan", "member")];
const VIP = { id: "50000000-0000-4000-8000-000000000001", server_id: SERVER_ID, name: "VIP", color: "#facc15", position: 0, created_at: "2026-10-01T00:00:00Z" };

const upsertChannel = vi.fn();

function Shell({ children, myRole = "admin" as const, channels }: { children: ReactNode; myRole?: "admin"; channels?: Channel[] }) {
  return (
    <ServerFixture members={members} myRole={myRole} overrides={{ roles: [VIP], memberRoles: new Map([[MOD_ID, [VIP.id]]]), upsertChannel, ...(channels ? { channels } : {}) }}>
      {children}
      <ConfirmHost />
    </ServerFixture>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("roles", () => {
  it("creates a role with a colour and lists who has each", async () => {
    const user = userEvent.setup();
    render(
      <Shell>
        <RolesSettings />
      </Shell>,
    );
    expect(within(screen.getByTestId("roles-list")).getByText("1 member")).toBeInTheDocument();
    await user.type(screen.getByLabelText("New role name"), "Tropa");
    await user.click(within(screen.getByRole("radiogroup", { name: "New role colour" })).getByRole("radio", { name: "#f472b6" }));
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(serverActions.createRoleAction).toHaveBeenCalledWith({ serverId: SERVER_ID, name: "Tropa", color: "#f472b6" }));
  });
});

describe("private channels", () => {
  it("lets an admin make a channel private and pick the people and roles let in", async () => {
    const user = userEvent.setup();
    vi.mocked(serverActions.createChannelAction).mockResolvedValueOnce({ ok: true, data: { channelId: "20000000-0000-4000-8000-000000000099", channel: { id: "20000000-0000-4000-8000-000000000099" } } } as never);
    render(
      <Shell>
        <ChannelDialog open onClose={() => undefined} />
      </Shell>,
    );
    await user.type(screen.getByLabelText("Channel name"), "secret base");
    expect(screen.queryByTestId("channel-access")).toBeNull();
    await user.click(screen.getByRole("switch", { name: /Private channel/ }));
    const access = screen.getByTestId("channel-access");
    // Admins are always in, so they aren't listed.
    expect(within(access).queryByText("Kapitan")).toBeNull();
    fireEvent.click(within(access).getByLabelText("VIP"));
    fireEvent.click(within(access).getByLabelText(/Juan/));
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(serverActions.createChannelAction).toHaveBeenCalledWith(expect.objectContaining({ isPrivate: true })));
    await waitFor(() =>
      expect(serverActions.setChannelAccessAction).toHaveBeenCalledWith({
        channelId: "20000000-0000-4000-8000-000000000099",
        serverId: SERVER_ID,
        userIds: [MEMBER_ID],
        roleIds: [VIP.id],
      }),
    );
  });
});

describe("creating a channel", () => {
  it("puts a voice channel where voice channels live, and shows it in the sidebar at once", async () => {
    const user = userEvent.setup();
    // Like Diskarte HQ: everything under one custom category.
    const hq = [makeChannel("20000000-0000-4000-8000-0000000000a1", "announcements", "text", 0, "Diskarte HQ"), makeChannel("20000000-0000-4000-8000-0000000000a3", "Lounge", "voice", 1, "Hangout")];
    const created = { ...makeChannel("20000000-0000-4000-8000-0000000000b1", "Tambayan", "voice", 2, "Hangout") };
    vi.mocked(serverActions.createChannelAction).mockResolvedValueOnce({ ok: true, data: { channelId: created.id, channel: created } } as never);
    render(
      <Shell channels={hq}>
        <ChannelDialog open onClose={() => undefined} />
      </Shell>,
    );
    expect(screen.getByLabelText("Category")).toHaveValue("Diskarte HQ");
    await user.click(screen.getByRole("radio", { name: /Voice/ }));
    expect(screen.getByLabelText("Category")).toHaveValue("Hangout");
    await user.type(screen.getByLabelText("Channel name"), "Tambayan");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(serverActions.createChannelAction).toHaveBeenCalledWith(expect.objectContaining({ type: "voice", category: "Hangout" })));
    await waitFor(() => expect(upsertChannel).toHaveBeenCalledWith(created));
  });

  it("keeps a category you typed when you switch the type", async () => {
    const user = userEvent.setup();
    render(
      <Shell>
        <ChannelDialog open onClose={() => undefined} />
      </Shell>,
    );
    await user.clear(screen.getByLabelText("Category"));
    await user.type(screen.getByLabelText("Category"), "Games");
    await user.click(screen.getByRole("radio", { name: /Voice/ }));
    expect(screen.getByLabelText("Category")).toHaveValue("Games");
  });
});
