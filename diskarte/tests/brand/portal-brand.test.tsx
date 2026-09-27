// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PORTAL_BRAND_DIR, PORTAL_PUBLIC_DIR, portalBrandSvgs } from "@/components/brand/portal-export";

/** Repository root: diskarte/ and early-access-portal/ are siblings. */
const root = path.resolve(__dirname, "../../..");

describe("Early Access portal brand assets", () => {
  it("match the main app's logo components (run `npm run brand:assets` after changing them)", () => {
    for (const [file, markup] of Object.entries(portalBrandSvgs())) {
      const shipped = fs.readFileSync(path.join(root, PORTAL_BRAND_DIR, file), "utf8");
      expect(shipped, `${PORTAL_BRAND_DIR}/${file} is stale`).toBe(markup);
      expect(shipped).toContain('xmlns="http://www.w3.org/2000/svg"');
    }
    expect(fs.statSync(path.join(root, PORTAL_PUBLIC_DIR, "email/salakot.png")).size).toBeGreaterThan(1000);
  });
});
