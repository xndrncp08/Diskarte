import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { audioMock } from "../mocks/audio";
import { livekitMock, mockCameraPlaceholder, mockParticipant } from "../mocks/livekit";
import { navigation } from "../mocks/navigation";
import { MOD_ID, OWNER_ID, makeProfile, server } from "../fixtures/server";

// ---- server actions (the only server boundary the UI talks to) ---------------------------
vi.mock("@/actions/messages", async () => (await import("../mocks/actions")).messageActions);
vi.mock("@/actions/servers", async () => (await import("../mocks/actions")).serverActions);
vi.mock("@/actions/profile", async () => (await import("../mocks/actions")).profileActions);
vi.mock("sonner", async () => (await import("../mocks/actions")).toastMock);

const { DiskarteLogo } = await import("@/components/brand/DiskarteLogo");
const { DiskarteWordmark } = await import("@/components/brand/DiskarteWordmark");
const { default: LandingPage } = await import("@/app/page");
const { RuntimeConfigProvider } = await import("@/components/providers/RuntimeConfig");
const { UserAvatar } = await import("@/components/profile/UserAvatar");
const { ProfileBuilder } = await import("@/components/profile/ProfileBuilder");
const { DiskarteLayout, GENERAL, MEMBERS: members, RUNTIME, TAMBAYAN, channelUrl } = await import("../fixtures/layout");

const channelNav = () => screen.getByRole("navigation", { name: "Channels" });

beforeEach(() => {
  audioMock.notes.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ token: "jwt", url: RUNTIME.livekitUrl, room: `voice:${TAMBAYAN.id}` }), { status: 200 })),
  );
});

// =============================================================================================
describe("branding & vector logo", () => {
  it("renders the salakot badge as an accessible, crisp inline SVG", () => {
    const { container } = render(<DiskarteLogo size={96} />);
    const svg = screen.getByRole("img", { name: "Diskarte" });
    expect(svg).toHaveAttribute("viewBox", "0 0 512 512");
    expect(svg).toHaveAttribute("width", "96");
    // Salakot cone + weave clip, chat bubble clip, midnight disc and Philippine-sun gradient.
    expect(container.querySelector("clipPath[id$='-cone']")).not.toBeNull();
    expect(container.querySelector("clipPath[id$='-bubble']")).not.toBeNull();
    expect(container.querySelector("circle[fill='#0F172A']")).not.toBeNull();
    const sunStops = Array.from(container.querySelectorAll("radialGradient[id$='-sun'] stop")).map((s) => s.getAttribute("stop-color"));
    expect(sunStops).toContain("#FFB800");
    expect(container.querySelectorAll("g[stroke='#B7791F'] path").length).toBeGreaterThanOrEqual(7); // woven ribs + rings
  });

  it("drops the disc in the mascot variant and supports a dark bubble", () => {
    const { container } = render(<DiskarteLogo variant="mascot" tone="dark" />);
    expect(container.querySelector("circle[fill='#0F172A']")).toBeNull();
    expect(container.querySelector("rect[fill='#1E293B']")).not.toBeNull();
  });

  it("renders the wordmark lockup with brush lettering, golden tittle and swoosh", () => {
    const { container } = render(<DiskarteWordmark height={48} />);
    const svg = screen.getByRole("img", { name: "Diskarte" });
    expect(svg).toHaveAttribute("height", "48");
    expect(container.querySelector("circle[fill='#FFB800']")).not.toBeNull();
    expect(container.querySelector("linearGradient[id$='-swoosh']")).not.toBeNull();
    const lettering = Array.from(container.querySelectorAll("path[fill='#FFF8EC']")).map((p) => p.getAttribute("d") ?? "");
    expect(lettering.some((d) => d.length > 1000)).toBe(true); // "Diskarte" glyph outlines
    expect(container.querySelector("clipPath[id$='-cone']")).not.toBeNull(); // mascot included
  });

  it("shows the tagline on the welcome page", () => {
    render(<LandingPage />);
    const heading = screen.getByRole("heading", { level: 1 });
    // Rendered as two lines of one heading: "Walang Shutdown-Shutdown." / "Ang Bagong Istambayan ng Bayan."
    expect(heading).toHaveTextContent(/^Walang Shutdown-Shutdown\.\s*Ang Bagong Istambayan ng Bayan\.$/);
    expect(screen.getByRole("link", { name: /Create an account/ })).toHaveAttribute("href", "/signup");
  });
});

// =============================================================================================
describe("channel navigation & sidebar", () => {
  it("lists the default text and voice channels by category", () => {
    render(<DiskarteLayout />);
    const nav = channelNav();
    for (const name of ["general", "chika", "lfg-valorant"]) {
      const link = within(nav).getByRole("link", { name });
      expect(link).toHaveAttribute("data-channel-type", "text");
    }
    expect(within(nav).getByRole("link", { name: "Tambayan 1" })).toHaveAttribute("data-channel-type", "voice");
    expect(within(nav).getByRole("button", { name: "Text Channels" })).toHaveAttribute("aria-expanded", "true");
    expect(within(nav).getByRole("button", { name: "Voice Channels" })).toHaveAttribute("aria-expanded", "true");
    // Presence: Maria is hanging out in Tambayan 1.
    expect(within(nav).getByRole("list", { name: "In voice" })).toHaveTextContent("Maria");
  });

  it("switches the active view to the voice room, then the call grid after joining", async () => {
    const user = userEvent.setup();
    navigation.set(channelUrl(GENERAL.id));
    livekitMock.tracks = [mockCameraPlaceholder(mockParticipant(OWNER_ID, { isLocal: true })), mockCameraPlaceholder(mockParticipant(MOD_ID))];
    render(<DiskarteLayout />);
    const view = screen.getByTestId("active-view");
    expect(within(view).getByTestId("composer")).toBeInTheDocument();

    await user.click(within(channelNav()).getByRole("link", { name: "Tambayan 1" }));
    expect(navigation.path).toBe(channelUrl(TAMBAYAN.id));
    expect(within(view).queryByTestId("composer")).toBeNull();
    expect(within(view).getByText("VOICE CHANNEL")).toBeInTheDocument();
    expect(within(view).getByText("1 in voice now")).toBeInTheDocument();

    await user.click(within(view).getByTestId("join-voice"));
    const stage = await within(view).findByTestId("voice-stage");
    expect(within(stage).getAllByTestId("participant-tile")).toHaveLength(2);
    expect(within(stage).getByText("(you)")).toBeInTheDocument();
    expect(within(stage).getByRole("toolbar", { name: "Call controls" })).toBeInTheDocument();
    expect(audioMock.notes.length).toBeGreaterThan(0); // 8-bit join cue
  });

  it("highlights the active channel with the glass active style", async () => {
    const user = userEvent.setup();
    navigation.set(channelUrl(GENERAL.id));
    render(<DiskarteLayout />);
    const general = within(channelNav()).getByRole("link", { name: "general" });
    const chika = within(channelNav()).getByRole("link", { name: "chika" });
    expect(general).toHaveAttribute("aria-current", "page");
    expect(general.parentElement).toHaveClass("bg-white/10", "text-white");
    expect(chika).not.toHaveAttribute("aria-current");

    await user.click(chika);
    expect(chika).toHaveAttribute("aria-current", "page");
    expect(chika.parentElement).toHaveClass("bg-white/10", "text-white");
    expect(general).not.toHaveAttribute("aria-current");
    expect(general.parentElement).not.toHaveClass("bg-white/10");
    expect(screen.getByTestId("composer")).toHaveAttribute("placeholder", "Message #chika");
  });
});

// =============================================================================================
describe("real-time messaging input", () => {
  beforeEach(() => navigation.set(channelUrl(GENERAL.id)));

  it("renders the composer with the channel placeholder", () => {
    render(<DiskarteLayout />);
    expect(screen.getByPlaceholderText("Message #general")).toBe(screen.getByTestId("composer"));
  });

  it("updates the input as the user types", async () => {
    const user = userEvent.setup();
    render(<DiskarteLayout />);
    const input = screen.getByTestId("composer");
    await user.type(input, "Tara ranked mamaya?");
    expect(input).toHaveValue("Tara ranked mamaya?");
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
  });

  it("sends on Enter: the message joins the list and the input clears", async () => {
    const user = userEvent.setup();
    render(<DiskarteLayout />);
    const input = screen.getByTestId("composer");
    await user.type(input, "Mabuhay, **barkada**!{Enter}");
    const message = await screen.findByTestId("message");
    expect(message).toHaveTextContent("Mabuhay, barkada!");
    expect(within(message).getByText("barkada").tagName).toBe("STRONG");
    expect(input).toHaveValue("");
    await vi.waitFor(() => expect(message).not.toHaveClass("opacity-60")); // no longer pending
  });

  it("renders HTML/script payloads as escaped text instead of executing them", async () => {
    const user = userEvent.setup();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    render(<DiskarteLayout />);
    const input = screen.getByTestId("composer");
    await user.type(input, "<script>alert('xss')</script><img src=x onerror=alert(1)>{Enter}");
    const message = await screen.findByTestId("message");
    expect(message).toHaveTextContent("<script>alert('xss')</script><img src=x onerror=alert(1)>");
    expect(message.querySelector("script")).toBeNull();
    expect(message.querySelector("img")).toBeNull();
    expect(document.querySelectorAll("script")).toHaveLength(0);
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

// =============================================================================================
describe("profile & status triggers", () => {
  it("renders salakot preset avatars with pixel status badges", () => {
    render(
      <>
        <UserAvatar profile={members[1].profile} status="online" size={48} />
        <UserAvatar profile={members[2].profile} status="dnd" size={48} />
      </>,
    );
    expect(document.querySelector("[data-preset='ube']")).not.toBeNull();
    expect(document.querySelector("[data-preset='dagat']")).not.toBeNull();
    expect(screen.getByRole("img", { name: "Online" })).toHaveAttribute("data-status", "online");
    expect(screen.getByRole("img", { name: "Do Not Disturb" })).toHaveAttribute("data-status", "dnd");
  });

  it("updates the user panel when a Pinoy status trigger is picked", async () => {
    const user = userEvent.setup();
    navigation.set(channelUrl(GENERAL.id));
    render(<DiskarteLayout />);
    const panel = screen.getByTestId("user-panel");
    expect(panel).not.toHaveTextContent("Nagluto ng Canton");

    for (const [item, shown] of [
      [/Nagluto ng Canton/, "🍜 Nagluto ng Canton"],
      [/AFK \/ Tulog/, "😴 AFK / Tulog"],
      [/LFG/, "🎮 LFG"],
    ] as const) {
      await user.click(within(panel).getByRole("button", { name: /Set status/ }));
      await user.click(await screen.findByRole("menuitemradio", { name: item }));
      await vi.waitFor(() => expect(panel).toHaveTextContent(shown));
    }
  });

  it("updates the profile preview from status tags in the profile builder", async () => {
    const user = userEvent.setup();
    render(
      <RuntimeConfigProvider value={RUNTIME}>
        <ProfileBuilder profile={makeProfile(OWNER_ID, "Kapitan")} mode="settings" />
      </RuntimeConfigProvider>,
    );
    const card = screen.getByTestId("profile-card");
    for (const [tag, emoji] of [
      ["Nagluto ng Canton", "🍜"],
      ["AFK / Tulog", "😴"],
      ["LFG / Pa-carry", "🎮"],
    ] as const) {
      await user.click(screen.getByRole("button", { name: new RegExp(tag.replace("/", "\\/")) }));
      expect(card).toHaveTextContent(`${emoji}${tag}`);
      expect(screen.getByLabelText("Custom status")).toHaveValue(tag);
    }
    expect(server.name).toBe("Barkada HQ");
  });
});
