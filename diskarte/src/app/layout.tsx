import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { Inter, JetBrains_Mono, Press_Start_2P, Silkscreen } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { AppToaster } from "@/components/AppToaster";
import { RuntimeConfigProvider } from "@/components/providers/RuntimeConfig";
import { PwaProvider } from "@/components/providers/PwaProvider";
import { VisitBeacon } from "@/components/VisitBeacon";
import { tryGetPublicEnv } from "@/lib/env";
import { isTheme, THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const pressStart = Press_Start_2P({ variable: "--font-press-start", weight: "400", subsets: ["latin"], display: "swap" });
const silkscreen = Silkscreen({ variable: "--font-silkscreen", weight: ["400", "700"], subsets: ["latin"], display: "swap" });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], display: "swap" });

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

export const viewport: Viewport = {
  themeColor: "#0F172A",
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

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

  return (
    <html
      lang={language}
      data-color-mode={mode}
      data-theme={isTheme(theme) ? theme : undefined}
      className={`${inter.variable} ${pressStart.variable} ${silkscreen.variable} ${jetbrains.variable} h-full`}
      suppressHydrationWarning
    >
      <head>{mode === "system" && <script nonce={nonce ?? undefined} dangerouslySetInnerHTML={{ __html: "document.documentElement.dataset.colorMode=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'" }} />}</head>
      <body className="min-h-full bg-abyss text-slate-100 antialiased">
        <RuntimeConfigProvider
          value={
            env
              ? { supabaseUrl: env.supabaseUrl, supabaseAnonKey: env.supabaseAnonKey, livekitUrl: env.livekitUrl, siteUrl: env.siteUrl }
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
