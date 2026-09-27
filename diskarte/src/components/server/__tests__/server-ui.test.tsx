import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MEMBER_ID, MOD_ID, OWNER_ID, ServerFixture, makeMember, presenceFor, server } from "../../../../tests/fixtures/server";

vi.mock("@/actions/servers", () => ({
  setMemberRoleAction: vi.fn(async () => ({ ok: true })),
  kickMemberAction: vi.fn(async () => ({ ok: true })),
  createServerAction: vi.fn(),
  joinServerAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ serverId: "10000000-0000-4000-8000-000000000001" }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/tambayan",
}));

const { MemberList } = await import("@/components/server/MemberList");
const { ServerRail } = await import("@/components/shell/ServerRail");
const actions = await import("@/actions/servers");

const members = [
  makeMember(OWNER_ID, "Kapitan", "admin"),
  makeMember(MOD_ID, "Maria", "moderator", { custom_status: "LFG", custom_status_emoji: "🎮" }),
  makeMember(MEMBER_ID, "Juan", "member"),
];

describe("MemberList", () => {
  it("groups online members by role and dims offline ones", () => {
    const presence = new Map([
      [OWNER_ID, presenceFor(OWNER_ID)],
      [MOD_ID, presenceFor(MOD_ID, { custom_status: "LFG", custom_status_emoji: "🎮" })],
      [MEMBER_ID, presenceFor(MEMBER_ID, { status: "invisible" })],
    ]);
    render(
      <ServerFixture members={members} presence={presence}>
        <MemberList />
      </ServerFixture>,
    );
    const list = screen.getByTestId("member-list");
    expect(within(list).getByText("Admins — 1")).toBeInTheDocument();
    expect(within(list).getByText("Moderators — 1")).toBeInTheDocument();
    expect(within(list).getByText("Offline — 1")).toBeInTheDocument();
    expect(within(list).getByLabelText("Owner")).toBeInTheDocument();
    expect(within(list).getByText(/LFG/)).toBeInTheDocument();
  });

  it("lets the owner promote a member from the profile popover", async () => {
    render(
      <ServerFixture members={members}>
        <MemberList />
      </ServerFixture>,
    );
    const juan = screen.getAllByTestId("member-row").find((row) => row.textContent?.includes("Juan"))!;
    fireEvent.click(juan);
    const dialog = await screen.findByRole("dialog", { name: "Juan's profile" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Moderator" }));
    await vi.waitFor(() => expect(actions.setMemberRoleAction).toHaveBeenCalledWith({ serverId: server.id, userId: MEMBER_ID, role: "moderator" }));
    expect(within(dialog).getByRole("button", { name: /Kick/ })).toBeInTheDocument();
  });

  it("hides moderation controls from regular members", async () => {
    render(
      <ServerFixture members={members} meId={MEMBER_ID} myRole="member">
        <MemberList />
      </ServerFixture>,
    );
    const maria = screen.getAllByTestId("member-row").find((row) => row.textContent?.includes("Maria"))!;
    fireEvent.click(maria);
    const dialog = await screen.findByRole("dialog", { name: "Maria's profile" });
    expect(within(dialog).queryByRole("group", { name: "Set role" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /Kick/ })).toBeNull();
  });
});

describe("ServerRail", () => {
  it("links every server and marks the active one", () => {
    render(
      <ServerFixture members={members}>
        <ServerRail servers={[server, { ...server, id: "10000000-0000-4000-8000-000000000002", name: "Thesis Squad" }]} />
      </ServerFixture>,
    );
    expect(screen.getByRole("link", { name: "Barkada HQ" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Thesis Squad" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/tambayan");
  });

  it("opens the create / join dialog", async () => {
    render(
      <ServerFixture members={members}>
        <ServerRail servers={[]} />
      </ServerFixture>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add a server" }));
    expect(await screen.findByRole("dialog", { name: "Gumawa ng Tambayan" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Sumali/ }));
    expect(screen.getByLabelText("Invite link o code")).toBeInTheDocument();
  });
});
