import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../fixtures/fake-supabase";
import { MEMBER_ID, MOD_ID, OWNER_ID, makeProfile } from "../fixtures/server";
import { ConfirmHost } from "@/components/ui/ConfirmHost";

const tables: Record<string, unknown[]> = {};
let fake = createFakeSupabase(tables);
vi.mock("@/components/providers/RuntimeConfig", () => ({ useSupabase: () => fake.client, useOptionalSupabase: () => fake.client }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
const social = { profiles: new Map([[MOD_ID, makeProfile(MOD_ID, "Maria")], [MEMBER_ID, makeProfile(MEMBER_ID, "Juan")]]) };
vi.mock("@/components/providers/SocialProvider", () => ({ useOptionalSocial: () => social, useSocial: () => social }));

const { MeProvider } = await import("@/components/providers/MeProvider");
const { MomentsStrip, timeLeft } = await import("@/components/social/Moments");
const iso = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
const moment = (id: string, author: string, extra: object = {}) => ({ id, author_id: author, body: `hello ${id}`, image_path: null, audience: "friends", created_at: iso(-60), expires_at: iso(60 * 23), ...extra });

function view() {
  return render(
    <MeProvider profile={makeProfile(OWNER_ID, "Kapitan")}>
      <MomentsStrip />
      <ConfirmHost />
    </MeProvider>,
  );
}

beforeEach(() => {
  tables.moments = [moment("a", MOD_ID), moment("b", MEMBER_ID, { image_path: `${MEMBER_ID}/x.jpg`, body: null }), moment("c", MOD_ID, { created_at: iso(-10) })];
  tables.moment_mutes = [];
  fake = createFakeSupabase(tables);
});

describe("moments", () => {
  it("formats the time left", () => {
    const now = Date.now();
    expect(timeLeft(new Date(now + 3 * 3_600_000 + 60_000).toISOString(), now)).toBe("3h left");
    expect(timeLeft(new Date(now + 25 * 60_000).toISOString(), now)).toBe("25m left");
  });

  it("lists friends with live moments, most recent first, and steps through them", async () => {
    const user = userEvent.setup();
    view();
    const strip = await screen.findByRole("region", { name: "Moments" });
    const people = within(strip).getAllByRole("button", { name: /moments$/ });
    expect(people.map((b) => b.getAttribute("aria-label"))).toEqual(["Maria's moments", "Juan's moments"]);
    await user.click(people[0]);
    const dialog = await screen.findByRole("dialog", { name: "Maria's moment" });
    expect(dialog).toHaveTextContent("hello a");
    await user.click(within(dialog).getByRole("button", { name: /Next/ }));
    expect(dialog).toHaveTextContent("hello c");
    await user.click(within(dialog).getByRole("button", { name: /Next/ }));
    // Juan's photo comes from a short-lived signed URL.
    expect(await screen.findByRole("img", { name: "Photo from Juan" })).toHaveAttribute("src", `https://signed.test/${MEMBER_ID}/x.jpg`);
  });

  it("hides muted friends", async () => {
    tables.moment_mutes = [{ owner_id: OWNER_ID, target_id: MOD_ID }];
    fake = createFakeSupabase(tables);
    view();
    const strip = await screen.findByRole("region", { name: "Moments" });
    await waitFor(() => expect(within(strip).getAllByRole("button", { name: /moments$/ }).map((b) => b.getAttribute("aria-label"))).toEqual(["Juan's moments"]));
  });

  it("shares text with the chosen audience", async () => {
    const insert = vi.fn(async (_row: unknown) => { void _row; return { error: null }; });
    const read = fake.client.from.getMockImplementation()!;
    fake.client.from.mockImplementation((table) => ({ ...read(table), insert }) as never);
    const user = userEvent.setup();
    view();
    await user.click(await screen.findByRole("button", { name: "Share" }));
    const dialog = await screen.findByRole("dialog", { name: "Share a moment" });
    await user.type(within(dialog).getByLabelText(/What.s up/), "Kape muna");
    await user.selectOptions(within(dialog).getByLabelText("Who can see it"), "favourites");
    await user.click(within(dialog).getByRole("button", { name: "Share" }));
    await waitFor(() => expect(insert).toHaveBeenCalledWith({ body: "Kape muna", image_path: null, audience: "favourites" }));
  });
});
