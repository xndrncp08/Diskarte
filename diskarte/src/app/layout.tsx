import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { Bricolage_Grotesque, Figtree, Inter, JetBrains_Mono, Press_Start_2P, Silkscreen } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { AppToaster } from "@/components/AppToaster";
import { RuntimeConfigProvider } from "@/components/providers/RuntimeConfig";
import { PwaProvider } from "@/components/providers/PwaProvider";
import { VisitBeacon } from "@/components/VisitBeacon";
import { tryGetPublicEnv } from "@/lib/env";
import { getPlatformRole } from "@/lib/admin-server";
import { parseShell, resolveShell, SHELL_COOKIE } from "@/lib/shell";
import { isTheme, THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const pressStart = Press_Start_2P({ variable: "--font-press-start", weight: "400", subsets: ["latin"], display: "swap" });
const silkscreen = Silkscreen({ variable: "--font-silkscreen", weight: ["400", "700"], subsets: ["latin"], display: "swap" });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], display: "swap" });
// Pulse-only fonts: not preloaded, so Classic never downloads them (only Pulse styles reference them).
// Variable files: Bricolage keeps its optical-size axis for the 32/44 px display sizes; Figtree ships italics for emphasis.
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", axes: ["opsz"], subsets: ["latin"], display: "swap", preload: false });
const figtree = Figtree({ variable: "--font-figtree", style: ["normal", "italic"], subsets: ["latin"], display: "swap", preload: false });

export const TAGLINE = "Tara, Tambay Tayo. Ang Bagong Istambayan ng Bayan.";

export async function generateMetadata(): Promise<Metadata> {
  const env = tryGetPublicEnv();
  return {
    metadataBase: new URL(env?.siteUrl ?? "http://localhost:3000"),
    title: { default: "Diskarte — Ang Bagong Istambayan ng Bayan", template: "%s · Diskarte" },
    description: `${TAGLINE} Open-source chat, voice, video and screen share for gamers, students and whole communities.`,
    applicationName: "Diskarte",
    keywords: ["Diskarte", "Discord alternative", "Philippines", "voice chat", "gaming", "community", "open source"],
    openGraph: { type: "website", siteName: "Diskarte", locale: "en_PH" },
    twitter: { card: "summary_large_image" },
    appleWebApp: { capable: true, title: "Diskarte", statusBarStyle: "black-translucent" },
  };
}

// The browser chrome / installed-app status bar matches the saved colour mode from the first paint.
const THEME_COLOR = { dark: "#0F172A", light: "#f8fafc" } as const;

export async function generateViewport(): Promise<Viewport> {
  const mode = (await cookies()).get("diskarte-mode")?.value;
  return {
    themeColor:
      mode === "light"
        ? THEME_COLOR.light
        : mode === "system"
          ? [
              { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
              { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
            ]
          : THEME_COLOR.dark,
    colorScheme: mode === "light" ? "light" : mode === "system" ? "dark light" : "dark",
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    interactiveWidget: "resizes-content",
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Reading request headers opts every route into dynamic rendering, which the per-request CSP
  // nonce set in proxy.ts requires (Next.js applies the nonce to its own scripts automatically).
  const nonce = (await headers()).get("x-nonce");
  const jar = await cookies();
  const theme = jar.get(THEME_COOKIE)?.value;
  const savedMode = jar.get("diskarte-mode")?.value;
  const mode = savedMode === "light" || savedMode === "system" ? savedMode : "dark";
  const language = jar.get("diskarte-language")?.value === "fil" ? "fil" : "en";
  const env = tryGetPublicEnv();
  // Resolve the same rollout gate as the signed-in shell so its first paint matches the frame.
  const savedShell = jar.get(SHELL_COOKIE)?.value;
  const shell = parseShell(savedShell) === "pulse" ? resolveShell(savedShell, await getPlatformRole().catch(() => "member"), process.env.DISKARTE_PULSE_ROLLOUT === "opt-in") : "classic";

  return (
    <html
      lang={language}
      data-color-mode={mode}
      data-theme={isTheme(theme) ? theme : undefined}
      data-shell={shell}
      className={`${inter.variable} ${pressStart.variable} ${silkscreen.variable} ${jetbrains.variable} ${bricolage.variable} ${figtree.variable} h-full`}
      suppressHydrationWarning
    >
      <head>{mode === "system" && <script nonce={nonce ?? undefined} dangerouslySetInnerHTML={{ __html: "document.documentElement.dataset.colorMode=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'" }} />}</head>
      <body className="min-h-full bg-abyss text-slate-100 antialiased">
        <RuntimeConfigProvider
          value={
            env
              ? { supabaseUrl: env.supabaseUrl, supabaseAnonKey: env.supabaseAnonKey, livekitUrl: env.livekitUrl, siteUrl: env.siteUrl, pulseOptIn: process.env.DISKARTE_PULSE_ROLLOUT === "opt-in" }
              : null
          }
        >
          <PwaProvider>{children}</PwaProvider>
          <VisitBeacon />
        </RuntimeConfigProvider>
        <AppToaster />
        <Analytics />
      </body>
    </html>
  );
}
