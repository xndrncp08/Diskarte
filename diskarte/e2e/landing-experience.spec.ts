import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
  test(`landing composition and interactive preview at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const preview = page.getByTestId("product-playground");
    await preview
      .getByLabel("Try a demo message")
      .fill("Tara, let’s make something.");
    await preview.getByRole("button", { name: "Send demo message" }).click();
    await expect(preview.getByRole("log")).toContainText(
      "Tara, let’s make something.",
    );
    await expect(preview.getByLabel("Try a demo message")).toBeEmpty();
    const conversation = preview.getByRole("tab", { name: "Conversations" });
    await conversation.focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      preview.getByRole("tab", { name: "Voice & video" }),
    ).toBeFocused();
    await expect(preview.getByRole("tabpanel")).toContainText(
      "Illustrated call layout",
    );
    await page.keyboard.press("ArrowRight");
    await expect(
      preview.getByRole("tab", { name: "Shared workspace" }),
    ).toBeFocused();
    await preview
      .getByRole("checkbox", { name: "Bring everyone together" })
      .check();
    await expect(preview.getByRole("tabpanel")).toContainText(
      "2 of 3 sample tasks complete",
    );
    await page
      .getByRole("link", { name: "Explore features", exact: true })
      .click();
    await expect(page).toHaveURL(/#features$/);
    await expect(
      page.getByRole("heading", { name: /Everything happens/ }),
    ).toBeInViewport();
    await page.screenshot({
      path: `test-results/landing-${width}.png`,
      fullPage: true,
    });
    await expect(page.locator("canvas")).toHaveCount(0);
    if (width < 768) {
      await page.locator(".launch-mobile-menu summary").click();
      await page
        .getByRole("navigation", { name: "Explore this page" })
        .getByRole("link", { name: "Our story" })
        .click();
      await expect(
        page.getByRole("heading", { name: /May paraan/ }),
      ).toBeInViewport();
    }
  });
}

for (const mode of ["dark", "light"] as const) {
  test(`${mode} landing passes automated accessibility checks`, async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      { name: "diskarte-mode", value: mode, url: baseURL! },
    ]);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      audit.violations.map(({ id, nodes }) => ({
        id,
        targets: nodes.map((node) => node.target),
      })),
    ).toEqual([]);
  });
}

test("landing reserves its layout while images and fonts load", async ({ page }, info) => {
  await page.addInitScript(() => {
    const metrics = { cls: 0, lcp: 0 };
    Object.assign(window, { landingMetrics: metrics });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { hadRecentInput?: boolean; value: number })[]) {
        if (!entry.hadRecentInput) metrics.cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((list) => {
      metrics.lcp = list.getEntries().at(-1)?.startTime ?? 0;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((image) => image.decode().catch(() => undefined))); });
  await expect.poll(async () => page.evaluate(() => (window as unknown as Window & { landingMetrics: { lcp: number } }).landingMetrics.lcp)).toBeGreaterThan(0);
  const result = await page.evaluate(() => {
    const metrics = (window as unknown as Window & { landingMetrics: { cls: number; lcp: number } }).landingMetrics;
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    return { ...metrics, ttfb: navigation.responseStart - navigation.requestStart, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches };
  });
  await info.attach("landing-performance", { body: JSON.stringify(result), contentType: "application/json" });
  expect(result.cls).toBeLessThan(0.1);
});
