import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/lib/supabase/database.types";
import { createFakeSupabase } from "../fixtures/fake-supabase";

const fake = createFakeSupabase();
vi.mock("@/components/providers/RuntimeConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/providers/RuntimeConfig")>()),
  useSupabase: () => fake.client,
  useOptionalSupabase: () => fake.client,
}));
vi.mock("@/actions/profile", async () => (await import("../mocks/actions")).profileActions);
vi.mock("sonner", async () => (await import("../mocks/actions")).toastMock);

const { profileActions } = await import("../mocks/actions");
const { MeProvider } = await import("@/components/providers/MeProvider");
const { PresenceProvider, useServerPresence } = await import("@/components/providers/PresenceProvider");
const { UserPanel } = await import("@/components/shell/UserPanel");
const { ProfileBuilder } = await import("@/components/profile/ProfileBuilder");
const { RuntimeConfigProvider } = await import("@/components/providers/RuntimeConfig");
const { MEMBERS, RUNTIME } = await import("../fixtures/layout");
const { SERVER_ID } = await import("../fixtures/server");

const ME: Tables<"profiles"> = { ...MEMBERS[0].profile, status: "online", custom_status: null, custom_status_emoji: null };

function WatchServer() {
  useServerPresence(SERVER_ID);
  return null;
}

function renderPanel() {
  return render(
    <MeProvider profile={ME}>
      <PresenceProvider>
        <WatchServer />
        <UserPanel />
      </PresenceProvider>
    </MeProvider>,
  );
}

const panel = () => screen.getByTestId("user-panel");
const badge = () => within(panel()).getByRole("img", { name: /Online|Idle|Do Not Disturb|Invisible|Offline/ });
async function pick(user: ReturnType<typeof userEvent.setup>, item: RegExp) {
  await user.click(within(panel()).getByRole("button", { name: /Set status/ }));
  await user.click(await screen.findByRole("menuitemradio", { name: item }));
}

beforeEach(() => {
  fake.channels.length = 0;
  vi.mocked(profileActions.setStatusAction).mockClear();
});

describe("status indicator", () => {
  it("a Pinoy status trigger sets the matching presence: badge, ring and label all follow", async () => {
    const user = userEvent.setup();
    renderPanel();
    expect(badge()).toHaveAttribute("data-status", "online");
    expect(within(panel()).getByTestId("status-label")).toHaveTextContent("Online");

    await pick(user, /AFK \/ Tulog/);
    await waitFor(() => expect(badge()).toHaveAttribute("data-status", "idle"));
    expect(panel().querySelector("[data-status-ring]")).toHaveAttribute("data-status-ring", "idle");
    expect(within(panel()).getByTestId("status-label")).toHaveTextContent("😴 AFK / Tulog");
    expect(profileActions.setStatusAction).toHaveBeenLastCalledWith({ status: "idle", customStatus: "AFK / Tulog", customStatusEmoji: "😴" });

    await pick(user, /Nag-aaral pa boffum/);
    await waitFor(() => expect(badge()).toHaveAttribute("data-status", "dnd"));
    await pick(user, /LFG \/ Pa-carry/);
    await waitFor(() => expect(badge()).toHaveAttribute("data-status", "online"));
  });

  it("highlights the active presence and trigger in the status menu", async () => {
    const user = userEvent.setup();
    renderPanel();
    await pick(user, /Nagluto ng Canton/);
    await user.click(within(panel()).getByRole("button", { name: /Set status/ }));
    const menu = await screen.findByRole("menu", { name: "Set status" });
    expect(within(menu).getByRole("menuitemradio", { name: /Idle/ })).toHaveAttribute("aria-checked", "true");
    expect(within(menu).getByRole("menuitemradio", { name: /^Online/ })).toHaveAttribute("aria-checked", "false");
    expect(within(menu).getByRole("menuitemradio", { name: /Nagluto ng Canton/ })).toHaveAttribute("aria-checked", "true");
    expect(within(menu).getByRole("menuitemradio", { name: /AFK \/ Tulog/ })).toHaveAttribute("aria-checked", "false");

    // Choosing a presence keeps the custom status; clearing it shows the presence name again.
    await user.click(within(menu).getByRole("menuitemradio", { name: /Do Not Disturb/ }));
    await waitFor(() => expect(badge()).toHaveAttribute("data-status", "dnd"));
    expect(within(panel()).getByTestId("status-label")).toHaveTextContent("Nagluto ng Canton");
    await user.click(within(panel()).getByRole("button", { name: /Set status/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Clear custom status" }));
    await waitFor(() => expect(within(panel()).getByTestId("status-label")).toHaveTextContent("Do Not Disturb"));
  });

  it("opens on the current choice, in two labelled groups, with no stray 'selected' highlight", async () => {
    const user = userEvent.setup();
    renderPanel();
    await pick(user, /Nagluto ng Canton/); // → Idle + Nagluto ng Canton
    await pick(user, /Do Not Disturb/);
    await user.click(within(panel()).getByRole("button", { name: /Set status/ }));
    const menu = await screen.findByRole("menu", { name: "Set status" });
    // Focus lands on the checked presence, not on "Online" at the top.
    await waitFor(() => expect(within(menu).getByRole("menuitemradio", { name: /Do Not Disturb/ })).toHaveFocus());
    // Presence and custom status are separate, labelled choices (one check in each).
    const presence = within(menu).getByRole("group", { name: "Status" });
    const custom = within(menu).getByRole("group", { name: "Custom status" });
    expect(within(presence).getAllByRole("menuitemradio").filter((i) => i.getAttribute("aria-checked") === "true")).toHaveLength(1);
    expect(within(custom).getAllByRole("menuitemradio").filter((i) => i.getAttribute("aria-checked") === "true")).toHaveLength(1);
    // The gold highlight is for keyboard focus only, so a mouse-opened menu never looks like "Online" is picked.
    const online = within(menu).getByRole("menuitemradio", { name: /^Online/ });
    expect(online.className).not.toMatch(/(^|\s)focus:bg-sun/);
    expect(online.className).toMatch(/focus-visible:bg-sun/);
  });

  it("publishes the new status in my presence, so other members' rosters update live", async () => {
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => expect(fake.joined(`server:${SERVER_ID}`)).toBeDefined());
    const track = vi.mocked(fake.joined(`server:${SERVER_ID}`)!.handle.track);
    await pick(user, /AFK \/ Tulog/);
    await waitFor(() =>
      expect(track).toHaveBeenLastCalledWith(expect.objectContaining({ user_id: ME.id, status: "idle", custom_status: "AFK / Tulog", custom_status_emoji: "😴" })),
    );
  });
});

describe("member roster", () => {
  it("rings each member in their live presence colour, updating when it changes", async () => {
    const { MemberList } = await import("@/components/server/MemberList");
    const { ServerFixture, presenceFor, MOD_ID } = await import("../fixtures/server");
    const roster = (status: "online" | "idle" | "dnd") => (
      <ServerFixture members={MEMBERS} presence={new Map([[MOD_ID, presenceFor(MOD_ID, { status })]])}>
        <MemberList />
      </ServerFixture>
    );
    const ringOf = () => screen.getAllByTestId("member-row").find((r) => r.textContent?.includes("Maria"))!.querySelector("[data-status-ring]");
    const { rerender } = render(roster("online"));
    expect(ringOf()).toHaveAttribute("data-status-ring", "online");
    rerender(roster("idle"));
    expect(ringOf()).toHaveAttribute("data-status-ring", "idle");
    rerender(roster("dnd"));
    expect(ringOf()).toHaveAttribute("data-status-ring", "dnd");
  });
});

describe("profile builder status picker", () => {
  const builder = (profile: typeof ME) => (
    <RuntimeConfigProvider value={RUNTIME}>
      <ProfileBuilder profile={profile} mode="settings" />
    </RuntimeConfigProvider>
  );

  it("follows status changes made elsewhere instead of keeping a stale 'Online'", () => {
    const { rerender } = render(builder(ME));
    expect(screen.getByRole("radio", { name: /^Online/ })).toHaveAttribute("aria-checked", "true");
    rerender(builder({ ...ME, status: "dnd", custom_status: "Nag-aaral pa boffum", custom_status_emoji: "📚" }));
    expect(screen.getByRole("radio", { name: /Do Not Disturb/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /^Online/ })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByLabelText("Custom status")).toHaveValue("Nag-aaral pa boffum");
  });

  it("a trigger chip also selects its presence", async () => {
    const user = userEvent.setup();
    render(builder(ME));
    await user.click(screen.getByRole("button", { name: /AFK \/ Tulog/ }));
    expect(screen.getByRole("radio", { name: /Idle/ })).toHaveAttribute("aria-checked", "true");
  });
});
