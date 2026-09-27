// Rasterises the vector brand components into every static icon the app ships:
// favicon.ico, icon.svg, apple-icon.png, PWA icons and the Open Graph / Twitter cards.
// Output is committed; re-run after touching src/components/brand/*.
//
// Usage: npx tsx scripts/generate-brand-assets.tsx
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import pngToIco from "png-to-ico";
import { DiskarteLogo } from "../src/components/brand/DiskarteLogo";
import { DiskarteWordmark } from "../src/components/brand/DiskarteWordmark";
import { PORTAL_BRAND_DIR, PORTAL_PUBLIC_DIR, portalBrandSvgs } from "../src/components/brand/portal-export";

const root = path.resolve(__dirname, "..");
const repoRoot = path.resolve(root, "..");
const appDir = path.join(root, "src/app");
const iconsDir = path.join(root, "public/icons");

const NAVY = "#0F172A";
const DEEP = "#020617";
const GOLD = "#FFB800";

const svg = (el: React.ReactElement) => Buffer.from(renderToStaticMarkup(el));
const png = (el: React.ReactElement, size: number) => sharp(svg(el)).resize(size, size).png().toBuffer();

/** Badge centred on a full-bleed navy square (for maskable / apple icons that get cropped by the OS). */
async function paddedIcon(size: number, inset: number) {
  const inner = Math.round(size * (1 - inset * 2));
  const badge = await png(<DiskarteLogo size={inner} />, inner);
  return sharp({ create: { width: size, height: size, channels: 4, background: NAVY } })
    .composite([{ input: badge, left: Math.round((size - inner) / 2), top: Math.round((size - inner) / 2) }])
    .png()
    .toBuffer();
}

/** 8-bit pixel grid + sun glow backdrop shared by the social cards. */
function cardBackground(width: number, height: number) {
  const cell = 24;
  const pixels: string[] = [];
  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      const seed = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const r = seed - Math.floor(seed);
      if (r > 0.965) pixels.push(`<rect x="${x + 4}" y="${y + 4}" width="${cell - 8}" height="${cell - 8}" fill="${GOLD}" opacity="${(0.08 + (r - 0.965) * 4).toFixed(2)}"/>`);
    }
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${NAVY}"/><stop offset="1" stop-color="${DEEP}"/></linearGradient>
    <radialGradient id="glow" cx="0.82" cy="0.12" r="0.6"><stop offset="0" stop-color="${GOLD}" stop-opacity="0.35"/><stop offset="1" stop-color="${GOLD}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect width="100%" height="100%" fill="url(#glow)"/>
  ${pixels.join("")}
  <rect x="0" y="${height - 12}" width="${width}" height="12" fill="${GOLD}"/>
  <rect x="0" y="${height - 12}" width="${width / 3}" height="12" fill="#0038A8"/>
  <rect x="${(width / 3) * 2}" y="${height - 12}" width="${width / 3}" height="12" fill="#CE1126"/>
</svg>`);
}

async function socialCard(width: number, height: number) {
  const wordmarkHeight = Math.round(height * 0.34);
  const wordmark = await sharp(svg(<DiskarteWordmark height={wordmarkHeight} />)).png().toBuffer();
  const meta = await sharp(wordmark).metadata();
  const text = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <style>
    .tag { font: 700 ${Math.round(height * 0.052)}px 'Helvetica Neue', Arial, sans-serif; fill: #FFFFFF; }
    .sub { font: 500 ${Math.round(height * 0.034)}px 'Helvetica Neue', Arial, sans-serif; fill: #CBD5E1; }
    .px { font: 700 ${Math.round(height * 0.026)}px 'Courier New', monospace; fill: ${GOLD}; letter-spacing: 3px; }
  </style>
  <text x="50%" y="${Math.round(height * 0.7)}" text-anchor="middle" class="tag">Walang Shutdown-Shutdown: Ang Bagong Istambayan ng Bayan.</text>
  <text x="50%" y="${Math.round(height * 0.79)}" text-anchor="middle" class="sub">Open-source chat, voice &amp; screen share para sa buong barkada.</text>
  <text x="50%" y="${Math.round(height * 0.14)}" text-anchor="middle" class="px">&#9650; PRESS START &#9650;</text>
</svg>`);
  return sharp(cardBackground(width, height))
    .composite([
      { input: wordmark, left: Math.round((width - (meta.width ?? 0)) / 2), top: Math.round(height * 0.2) },
      { input: text, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}

async function main() {
  fs.mkdirSync(iconsDir, { recursive: true });

  const icoSizes = await Promise.all([16, 32, 48].map((s) => png(<DiskarteLogo size={s} />, s)));
  fs.writeFileSync(path.join(appDir, "favicon.ico"), await pngToIco(icoSizes));
  fs.writeFileSync(path.join(appDir, "icon.svg"), renderToStaticMarkup(<DiskarteLogo size={512} />));
  fs.writeFileSync(path.join(appDir, "apple-icon.png"), await paddedIcon(180, 0.06));

  fs.writeFileSync(path.join(iconsDir, "icon-192.png"), await png(<DiskarteLogo size={192} />, 192));
  fs.writeFileSync(path.join(iconsDir, "icon-512.png"), await png(<DiskarteLogo size={512} />, 512));
  fs.writeFileSync(path.join(iconsDir, "maskable-512.png"), await paddedIcon(512, 0.12));
  fs.writeFileSync(path.join(root, "public/wordmark.svg"), renderToStaticMarkup(<DiskarteWordmark height={96} />));

  const card = await socialCard(1200, 630);
  fs.writeFileSync(path.join(appDir, "opengraph-image.png"), card);
  fs.writeFileSync(path.join(appDir, "twitter-image.png"), card);
  fs.writeFileSync(path.join(appDir, "opengraph-image.alt.txt"), "Diskarte — Walang Shutdown-Shutdown: Ang Bagong Istambayan ng Bayan.");
  fs.writeFileSync(path.join(appDir, "twitter-image.alt.txt"), "Diskarte — Walang Shutdown-Shutdown: Ang Bagong Istambayan ng Bayan.");

  // Early Access portal: static SVGs + the mascot PNG used in the welcome email (email clients
  // don't render SVG).
  const portalBrand = path.join(repoRoot, PORTAL_BRAND_DIR);
  fs.mkdirSync(portalBrand, { recursive: true });
  for (const [file, markup] of Object.entries(portalBrandSvgs())) fs.writeFileSync(path.join(portalBrand, file), markup);
  fs.mkdirSync(path.join(repoRoot, PORTAL_PUBLIC_DIR, "email"), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, PORTAL_PUBLIC_DIR, "email/salakot.png"), await paddedIcon(176, 0.08));

  console.log("Brand assets written to src/app, public/icons and early-access-portal/public");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
