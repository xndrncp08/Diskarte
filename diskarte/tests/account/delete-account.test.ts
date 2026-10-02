// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const USER = "00000000-0000-4000-8000-0000000000aa";

type Result = { data: unknown; error: { message: string } | null };

const db = {
  order: [] as string[],
  removed: [] as { bucket: string; paths: string[] }[],
  files: [] as { bucket: string; path: string }[],
  removeError: null as { message: string } | null,
  deleteError: null as { message: string } | null,
  signOutScope: null as string | null,
};

class Redirect extends Error {
  constructor(public url: string) {
    super(`NEXT_REDIRECT ${url}`);
  }
}

vi.mock("@/lib/auth", () => ({ getSessionUser: async () => ({ id: USER, user_metadata: {} }) }));
vi.mock("@/lib/rate-limit", () => ({ checkLimit: async () => ({ ok: true }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async (): Promise<Result> => ({ data: { username: "juan.tamad" }, error: null }) }) }),
    }),
    rpc: async (name: string, args: unknown): Promise<Result> => {
      db.order.push(`rpc:${name}:${JSON.stringify(args ?? null)}`);
      if (name === "account_deletion_files") return { data: db.files, error: null };
      return { data: null, error: db.deleteError };
    },
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          db.order.push(`remove:${bucket}`);
          db.removed.push({ bucket, paths });
          return { data: [], error: db.removeError };
        },
      }),
    },
    auth: {
      signOut: async ({ scope }: { scope: string }) => {
        db.order.push("signOut");
        db.signOutScope = scope;
        return { error: { message: "User not found" } };
      },
    },
  }),
}));

const { deleteAccountAction } = await import("@/actions/account");

beforeEach(() => {
  db.order = [];
  db.removed = [];
  db.files = [];
  db.removeError = null;
  db.deleteError = null;
  db.signOutScope = null;
});

describe("deleteAccountAction", () => {
  it("rejects a confirmation that doesn't match the username, touching nothing", async () => {
    expect(await deleteAccountAction({ confirm: "" })).toEqual({ fieldErrors: { confirm: "Type your username to confirm" } });
    expect(await deleteAccountAction({ confirm: "juan" })).toEqual({ fieldErrors: { confirm: "That doesn't match your username" } });
    expect(db.order).toEqual([]);
  });

  it("removes files per bucket in batches, deletes the account, signs out and redirects", async () => {
    db.files = [
      ...Array.from({ length: 150 }, (_, i) => ({ bucket: "attachments", path: `s/c/${USER}/${i}.png` })),
      { bucket: "avatars", path: `${USER}/avatar.png` },
    ];
    await expect(deleteAccountAction({ confirm: " @Juan.Tamad " })).rejects.toMatchObject({ url: "/login?deleted=1" });
    expect(db.removed.map((r) => [r.bucket, r.paths.length])).toEqual([
      ["attachments", 100],
      ["attachments", 50],
      ["avatars", 1],
    ]);
    // Files go before the account (afterwards the session can no longer remove them), then sign-out.
    expect(db.order).toEqual([
      "rpc:account_deletion_files:null",
      "remove:attachments",
      "remove:attachments",
      "remove:avatars",
      'rpc:delete_my_account:{"p_confirm":"juan.tamad"}',
      "signOut",
    ]);
    expect(db.signOutScope).toBe("local");
  });

  it("keeps the account when its files can't be removed", async () => {
    db.files = [{ bucket: "avatars", path: `${USER}/avatar.png` }];
    db.removeError = { message: "storage down" };
    expect(await deleteAccountAction({ confirm: "juan.tamad" })).toEqual({ error: expect.stringMatching(/nothing was deleted/) });
    expect(db.order.some((o) => o.startsWith("rpc:delete_my_account"))).toBe(false);
  });

  it("reports a failed deletion without signing out", async () => {
    db.deleteError = { message: "boom" };
    expect(await deleteAccountAction({ confirm: "juan.tamad" })).toEqual({ error: "Couldn't delete your account. Try again." });
    expect(db.order).not.toContain("signOut");
  });
});
