import path from "node:path";
import sharp from "sharp";
import { test, type Page } from "@playwright/test";

// `npm run docs:screens`: public pages from the production build, for the Help Center. Skipped otherwise.
test.skip(!process.env.DOCS_SCREENS, "set DOCS_SCREENS=1 (npm run docs:screens)");

const OUT = path.resolve(__dirname, "../public/docs-assets/screens");
async function shot(page: Page, name: string) {
  await page.waitForTimeout(400);
  await sharp(await page.screenshot()).webp({ quality: 78 }).toFile(path.join(OUT, `${name}.webp`));
}

test("sign-up and sign-in", async ({ page }) => {
  for (const [viewport, suffix] of [[{ width: 1280, height: 860 }, "desktop"], [{ width: 390, height: 844 }, "mobile"]] as const) {
    await page.setViewportSize(viewport);
    await page.goto("/signup");
    await page.getByLabel("Email").fill("juan@example.com");
    await shot(page, `signup-${suffix}`);
    await page.goto("/login");
    await shot(page, `login-${suffix}`);
  }
});
