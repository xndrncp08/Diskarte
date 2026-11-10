import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MemberRole } from "@/lib/supabase/database.types";

vi.mock("sonner", async () => (await import("../mocks/actions")).toastMock);

const { CommunityLanding } = await import("@/components/pulse/community/CommunityLanding");
const { RuntimeConfigProvider } = await import("@/components/providers/RuntimeConfig");
const { PresenceProvider } = await import("@/components/providers/PresenceProvider");
const { ShellKindContext } = await import("@/components/shell/ShellKind");
const { CallProvider } = await import("@/components/voice/CallProvider");
const { communityAccent, communityBanner, landingTiles, ON_ACCENT_DARK, ON_ACCENT_LIGHT } = await import("@/lib/community-identity");
const { getBrowserClient } = await import("@/lib/supabase/browser");
const { RUNTIME } = await import("../fixtures/layout");
const { MEMBER_ID, OWNER_ID, ServerFixture, makeMember, server } = await import("../fixtures/server");

const BUCKET = `${RUNTIME.supabaseUrl}/storage/v1/object/public/avatars/servers/${server.id}/banner-1.png`;
const MEMBERS = [makeMember(OWNER_ID, "Kapitan", "admin"), makeMember(MEMBER_ID, "Juan", "member")];

function Landing({ role, overrides = {} }: { role: MemberRole; overrides?: Record<string, unknown> }) {
  return (
    <RuntimeConfigProvider value={RUNTIME}>
      <ServerFixture members={MEMBERS} meId={role === "member" ? MEMBER_ID : OWNER_ID} myRole={role} overrides={{ server: { ...server, join_approval: true, ...overrides } }}>
        <PresenceProvider>
          <CallProvider>
            <ShellKindContext.Provider value="pulse">
              <CommunityLanding events={[{ id: "e1", name: "Weekend hangout", starts_at: "2099-01-01T12:00:00Z", ends_at: null }]} />
            </ShellKindContext.Provider>
          </CallProvider>
        </PresenceProvider>
      </ServerFixture>
    </RuntimeConfigProvider>
  );
}

describe("community identity helpers", () => {
  it("picks whichever of white and near-black contrasts more, and ignores malformed colours", () => {
    expect(communityAccent("#1e3a8a")).toEqual({ background: "#1e3a8a", color: ON_ACCENT_LIGHT });
    expect(communityAccent("#FFB800")).toEqual({ background: "#ffb800", color: ON_ACCENT_DARK });
    // Mid greys: the larger ratio flips between #797979 (white) and #7a7a7a (near-black).
    expect(communityAccent("#787878")?.color).toBe(ON_ACCENT_LIGHT);
    expect(communityAccent("#7a7a7a")?.color).toBe(ON_ACCENT_DARK);
    for (const bad of [null, undefined, "", "red", "#fff", "#12345g", "url(x)"]) expect(communityAccent(bad)).toBeNull();
  });

  it("allows a banner only from this project's public avatars bucket", () => {
    expect(communityBanner(BUCKET, RUNTIME.supabaseUrl)).toBe(BUCKET);
    for (const url of [
      "https://tracker.example/pixel.png",
      "https://proj.supabase.co.evil.example/storage/v1/object/public/avatars/x.png",
      "https://other.supabase.co/storage/v1/object/public/avatars/x.png",
      `${RUNTIME.supabaseUrl}/storage/v1/object/public/attachments/x.png`,
      `${RUNTIME.supabaseUrl}/storage/v1/object/public/avatars/../attachments/x.png`,
      `${RUNTIME.supabaseUrl}/storage/v1/object/public/avatars/%2e%2e/attachments/x.png`,
      `${RUNTIME.supabaseUrl}/storage/v1/object/public/avatars/.%2e/attachments/x.png`,
      `${RUNTIME.supabaseUrl}/storage/v1/object/public/avatars/%2E./attachments/x.png`,
      `${RUNTIME.supabaseUrl}/storage/v1/object/public/avatars/x%2f..%2fattachments/x.png`,
      `${RUNTIME.supabaseUrl}/storage/v1/object/public/avatars/%252e%252e/attachments/x.png`,
      `${RUNTIME.supabaseUrl}/storage/v1/object/public/avatars/..%5cattachments/x.png`,
      `${RUNTIME.supabaseUrl}/storage/v1/object/public/avatars/%5C..%5Cx.png`,
      "http://proj.supabase.co/storage/v1/object/public/avatars/x.png",
      "javascript:alert(1)",
      "not a url",
    ]) expect(communityBanner(url, RUNTIME.supabaseUrl), url).toBeNull();
    expect(communityBanner(BUCKET, null)).toBeNull();
    expect(communityBanner(null, RUNTIME.supabaseUrl)).toBeNull();
  });

  it("gates landing tiles: join requests for moderators with approval on, no invite in Diskarte HQ", () => {
    expect(landingTiles({ myRole: "member", isSystem: false, joinApproval: true })).not.toContain("requests");
    expect(landingTiles({ myRole: "moderator", isSystem: false, joinApproval: true })).toContain("requests");
    expect(landingTiles({ myRole: "admin", isSystem: false, joinApproval: false })).not.toContain("requests");
    expect(landingTiles({ myRole: "member", isSystem: true, joinApproval: false })).not.toContain("invite");
    expect(landingTiles({ myRole: "member", isSystem: false, joinApproval: false })).toEqual(expect.arrayContaining(["rooms", "events", "rules", "members", "workspace", "boards", "invite"]));
  });
});

describe("CommunityLanding", () => {
  it("shows a member the shared tiles but not the moderators' join requests", () => {
    render(<Landing role="member" />);
    expect(screen.getByRole("heading", { level: 1, name: server.name })).toBeInTheDocument();
    for (const id of ["tile-rooms", "tile-events", "tile-rules", "tile-members", "tile-workspace", "tile-boards", "tile-invite"]) expect(screen.getByTestId(id)).toBeInTheDocument();
    expect(screen.queryByTestId("tile-requests")).toBeNull();
    expect(within(screen.getByTestId("tile-events")).getByRole("link", { name: /Weekend hangout/ })).toHaveAttribute("href", `/tambayan/${server.id}?event=e1`);
  });

  it("shows moderators the join requests tile; only moderators query join requests", () => {
    const from = vi.spyOn(getBrowserClient(RUNTIME.supabaseUrl, RUNTIME.supabaseAnonKey), "from");
    const { unmount } = render(<Landing role="member" />);
    expect(from.mock.calls.filter(([table]) => table === "join_requests")).toHaveLength(0);
    unmount();
    render(<Landing role="moderator" />);
    expect(screen.getByTestId("tile-requests")).toHaveTextContent("Join requests");
    expect(from.mock.calls.filter(([table]) => table === "join_requests")).toHaveLength(1);
    from.mockRestore();
  });

  it("renders an allow-listed banner and ignores any other host", () => {
    const { unmount } = render(<Landing role="member" overrides={{ banner_url: BUCKET }} />);
    expect(screen.getByTestId("community-banner")).toHaveAttribute("src", BUCKET);
    unmount();
    render(<Landing role="member" overrides={{ banner_url: "https://tracker.example/pixel.png", accent_color: "#1e3a8a" }} />);
    expect(screen.queryByTestId("community-banner")).toBeNull();
    expect(document.querySelector("img[src*='tracker']")).toBeNull();
    // No usable banner: the accent band carries the name in its readable on-colour.
    expect(screen.getByTestId("community-accent")).toHaveStyle({ background: "#1e3a8a", color: ON_ACCENT_LIGHT });
  });

  it("works without the identity columns (migration not applied)", () => {
    render(<Landing role="member" />);
    expect(screen.queryByTestId("community-banner")).toBeNull();
    expect(screen.queryByTestId("community-accent")).toBeNull();
  });
});
