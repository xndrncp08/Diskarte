import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/lib/supabase/database.types";

vi.mock("@/actions/profile", () => ({
  updateProfileAction: vi.fn(async () => ({ ok: true })),
}));

const upload = vi.fn();
vi.mock("@/components/providers/RuntimeConfig", () => ({
  useSupabase: () => ({
    storage: {
      from: () => ({
        upload,
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://abc.supabase.co/storage/v1/object/public/avatars/${path}` } }),
      }),
    },
  }),
}));

const { ProfileBuilder } = await import("@/components/profile/ProfileBuilder");
const { ProfileCard } = await import("@/components/profile/ProfileCard");
const { UserAvatar } = await import("@/components/profile/UserAvatar");
const { SalakotAvatar } = await import("@/components/profile/SalakotAvatar");

const profile: Tables<"profiles"> = {
  id: "00000000-0000-4000-8000-000000000001",
  username: "juan",
  display_name: "Juan",
  avatar_preset: "araw",
  avatar_url: null,
  banner_preset: "paglubog",
  banner_url: null,
  bio: "",
  status: "online",
  custom_status: null,
  custom_status_emoji: null,
  onboarded: false,
  created_at: "2026-09-26T00:00:00Z",
  updated_at: "2026-09-26T00:00:00Z",
};

beforeEach(() => {
  upload.mockReset();
});

describe("avatars", () => {
  it("renders the salakot preset when there is no photo", () => {
    const { container } = render(<UserAvatar profile={profile} status="idle" />);
    expect(container.querySelector("[data-preset='araw']")).not.toBeNull();
    expect(screen.getByRole("img", { name: "Idle" })).toBeInTheDocument();
  });

  it("renders uploaded photos and the speaking ring", () => {
    const { container } = render(<UserAvatar profile={{ ...profile, avatar_url: "https://avatars.githubusercontent.com/u/1" }} speaking />);
    expect(container.querySelector("img")).toHaveAttribute("src", "https://avatars.githubusercontent.com/u/1");
    expect(container.firstChild).toHaveAttribute("data-speaking", "true");
  });

  it("labels presets when titled", () => {
    render(<SalakotAvatar preset="ube" title="Ube salakot" />);
    expect(screen.getByRole("img", { name: "Ube salakot" })).toBeInTheDocument();
  });
});

describe("ProfileCard", () => {
  it("shows name, handle, role, custom status and bio", () => {
    render(<ProfileCard profile={{ ...profile, bio: "Laging may baong Skyflakes", custom_status: "LFG", custom_status_emoji: "🎮" }} role="Moderator" />);
    expect(screen.getByText("Juan", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("@juan")).toBeInTheDocument();
    expect(screen.getByText("Moderator")).toBeInTheDocument();
    expect(screen.getByText("LFG")).toBeInTheDocument();
    expect(screen.getByText("Laging may baong Skyflakes")).toBeInTheDocument();
  });
});

describe("ProfileBuilder", () => {
  it("updates the live preview from status triggers and presets", () => {
    render(<ProfileBuilder profile={profile} mode="onboarding" />);
    fireEvent.click(screen.getByRole("button", { name: /Nagluto ng Canton/ }));
    const card = screen.getByTestId("profile-card");
    expect(card).toHaveTextContent("🍜");
    expect(card).toHaveTextContent("Nagluto ng Canton");

    fireEvent.click(screen.getByRole("radio", { name: "Ube" }));
    expect(card.querySelector("[data-preset='ube']")).not.toBeNull();
    expect((document.querySelector("input[name=avatarPreset]") as HTMLInputElement).value).toBe("ube");

    fireEvent.click(screen.getByRole("radio", { name: /Do Not Disturb/ }));
    expect(card.querySelector("[data-status='dnd']")).not.toBeNull();
  });

  it("toggles a trigger off when clicked twice", () => {
    render(<ProfileBuilder profile={profile} mode="settings" />);
    const chip = screen.getByRole("button", { name: /LFG/ });
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect((screen.getByLabelText("Custom status") as HTMLInputElement).value).toBe("");
  });

  it("uploads a custom avatar to the user's folder", async () => {
    upload.mockResolvedValue({ error: null });
    render(<ProfileBuilder profile={profile} mode="settings" />);
    const file = new File(["png"], "me.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Upload avatar image"), { target: { files: [file] } });
    await vi.waitFor(() => expect(upload).toHaveBeenCalled());
    expect(upload.mock.calls[0][0]).toMatch(new RegExp(`^${profile.id}/avatar-[0-9a-f-]+\\.png$`));
    await vi.waitFor(() =>
      expect((document.querySelector("input[name=avatarUrl]") as HTMLInputElement).value).toMatch(/storage\/v1\/object\/public\/avatars/),
    );
  });

  it("refuses non-image uploads before hitting storage", async () => {
    render(<ProfileBuilder profile={profile} mode="settings" />);
    const file = new File(["x"], "evil.svg", { type: "image/svg+xml" });
    fireEvent.change(screen.getByLabelText("Upload avatar image"), { target: { files: [file] } });
    await new Promise((r) => setTimeout(r, 10));
    expect(upload).not.toHaveBeenCalled();
  });

  it("includes the onboarding redirect only during onboarding", () => {
    const { unmount } = render(<ProfileBuilder profile={profile} mode="onboarding" />);
    expect(document.querySelector("input[name=redirectTo]")).toHaveAttribute("value", "/tambayan");
    unmount();
    render(<ProfileBuilder profile={profile} mode="settings" />);
    expect(document.querySelector("input[name=redirectTo]")).toBeNull();
  });
});
