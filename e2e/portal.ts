import path from "node:path";

/** Early Access portal wiring shared by playwright.config.ts and e2e/early-access.spec.ts. */
export const PORTAL_PORT = Number(process.env.E2E_PORTAL_PORT ?? 3100);
export const PORTAL_URL = `http://localhost:${PORTAL_PORT}`;
/** The portal's "file" mail transport writes here; the spec reads the credentials back. */
export const EMAIL_OUTBOX = path.resolve(__dirname, "..", ".e2e-email-outbox");
