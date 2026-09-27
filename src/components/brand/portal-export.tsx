import { renderToStaticMarkup } from "react-dom/server";
import { DiskarteLogo } from "./DiskarteLogo";
import { DiskarteWordmark } from "./DiskarteWordmark";

/**
 * Brand art shared with the Early Access portal (early-access-portal/public/brand). The portal is
 * a separate Next.js app, so it ships these static SVGs instead of importing React components
 * across package boundaries. `npm run brand:assets` writes them; tests/brand/portal-brand.test.tsx
 * fails if they drift from the components.
 */
export const PORTAL_BRAND_DIR = "early-access-portal/public/brand";

export function portalBrandSvgs(): Record<"logo.svg" | "mascot.svg" | "wordmark.svg", string> {
  return {
    "logo.svg": renderToStaticMarkup(<DiskarteLogo size={64} />),
    "mascot.svg": renderToStaticMarkup(<DiskarteLogo size={256} variant="mascot" title="Diskarte salakot mascot" />),
    "wordmark.svg": renderToStaticMarkup(<DiskarteWordmark height={96} />),
  };
}
