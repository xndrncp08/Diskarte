import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { navigation } from "../mocks/navigation";
import { MOD_ID, OWNER_ID, makeProfile } from "../fixtures/server";

vi.mock("@/actions/messages", async () => (await import("../mocks/actions")).messageActions);
vi.mock("@/actions/servers", async () => (await import("../mocks/actions")).serverActions);
vi.mock("@/actions/profile", async () => (await import("../mocks/actions")).profileActions);
vi.mock("sonner", async () => (await import("../mocks/actions")).toastMock);
vi.mock("@/app/(auth)/actions", () => ({
  signInAction: vi.fn(async () => ({})),
  signUpAction: vi.fn(async () => ({})),
  signInWithProviderAction: vi.fn(),
  requestPasswordResetAction: vi.fn(async () => ({})),
}));

const { DiskarteLayout, GENERAL, TAMBAYAN, RUNTIME, channelUrl, messageFixture } = await import("../fixtures/layout");
const { default: LandingPage } = await import("@/app/page");
const { LoginForm } = await import("@/components/auth/LoginForm");
const { SignupForm } = await import("@/components/auth/SignupForm");
const { OAuthButtons } = await import("@/components/auth/OAuthButtons");
const { ProfileBuilder } = await import("@/components/profile/ProfileBuilder");
const { SoundSettings } = await import("@/components/profile/SoundSettings");
const { RuntimeConfigProvider } = await import("@/components/providers/RuntimeConfig");

/** Rules that need a real layout/paint engine are checked in the browser instead (e2e). */
const DISABLED = ["color-contrast", "scrollable-region-focusable"];

/**
 * @param overlayOpen transient popovers are portalled to <body> (outside landmarks) and tied to their
 *   trigger via aria-controls/aria-expanded, so axe's "region" rule is waived while one is open.
 */
async function violations(root: Element = document.body, overlayOpen = false) {
  const disabled = overlayOpen ? [...DISABLED, "region"] : DISABLED;
  const result = await axe.run(root, { rules: Object.fromEntries(disabled.map((id) => [id, { enabled: false }])) });
  return result.violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join("\n  ")}`);
}

describe("accessibility (axe-core)", () => {
  it("landing page", async () => {
    render(<LandingPage />);
    expect(await violations()).toEqual([]);
  });

  it("login and sign-up forms", async () => {
    const { unmount } = render(
      <main>
        <h1>Login</h1>
        <LoginForm next="/tambayan" initialError="Incorrect email or password." />
        <OAuthButtons providers={["github", "google"]} next="/tambayan" />
      </main>,
    );
    expect(await violations()).toEqual([]);
    unmount();
    render(
      <main>
        <h1>Sign up</h1>
        <SignupForm />
      </main>,
    );
    expect(await violations()).toEqual([]);
  });

  it("chat shell: rail, channels, messages, composer, members", async () => {
    navigation.set(channelUrl(GENERAL.id));
    render(<DiskarteLayout history={{ [GENERAL.id]: [messageFixture("m1", GENERAL.id, MOD_ID, "Tara **ranked** mamaya?"), messageFixture("m2", GENERAL.id, OWNER_ID, "G!")] }} />);
    expect(await violations()).toEqual([]);
  });

  it("open menus, pickers and modals", async () => {
    const user = userEvent.setup();
    navigation.set(channelUrl(GENERAL.id));
    render(<DiskarteLayout history={{ [GENERAL.id]: [messageFixture("m1", GENERAL.id, MOD_ID, "Hello")] }} />);
    await user.click(screen.getByTestId("server-menu"));
    await screen.findByRole("menu");
    expect(await violations(document.body, true)).toEqual([]);
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Insert icon" }));
    await screen.findByRole("button", { name: "Petmalu" });
    expect(await violations(document.body, true)).toEqual([]);
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Add a server" }));
    await screen.findByRole("dialog", { name: "Create a server" });
    expect(await violations()).toEqual([]);
  });

  it("voice lobby", async () => {
    navigation.set(channelUrl(TAMBAYAN.id));
    render(<DiskarteLayout />);
    expect(await violations()).toEqual([]);
  });

  it("profile builder and sound settings", async () => {
    render(
      <RuntimeConfigProvider value={RUNTIME}>
        <main>
          <h1>Profile</h1>
          <ProfileBuilder profile={makeProfile(OWNER_ID, "Kapitan")} mode="settings" />
          <SoundSettings />
        </main>
      </RuntimeConfigProvider>,
    );
    expect(await violations()).toEqual([]);
  });
});
