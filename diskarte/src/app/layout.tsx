import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Inter, JetBrains_Mono, Press_Start_2P, Silkscreen } from "next/font/google";
import { AppToaster } from "@/components/AppToaster";
import { RuntimeConfigProvider } from "@/components/providers/RuntimeConfig";
import { tryGetPublicEnv } from "@/lib/env";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const pressStart = Press_Start_2P({ variable: "--font-press-start", weight: "400", subsets: ["latin"], display: "swap" });
const silkscreen = Silkscreen({ variable: "--font-silkscreen", weight: ["400", "700"], subsets: ["latin"], display: "swap" });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], display: "swap" });

export const TAGLINE = "Walang Shutdown-Shutdown: Ang Bagong Istambayan ng Bayan.";

export async function generateMetadata(): Promise<Metadata> {
  const env = tryGetPublicEnv();
  return {
    metadataBase: new URL(env?.siteUrl ?? "http://localhost:3000"),
    title: { default: "Diskarte — Ang Bagong Istambayan ng Bayan", template: "%s · Diskarte" },
    description: `${TAGLINE} Open-source chat, voice, video at screen share para sa gamers, estudyante at buong komunidad.`,
    applicationName: "Diskarte",
    keywords: ["Diskarte", "Discord alternative", "Philippines", "voice chat", "gaming", "community", "open source"],
    openGraph: { type: "website", siteName: "Diskarte", locale: "en_PH" },
    twitter: { card: "summary_large_image" },
    appleWebApp: { capable: true, title: "Diskarte", statusBarStyle: "black-translucent" },
  };
}

export const viewport: Viewport = {
  themeColor: "#0F172A",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Reading request headers opts every route into dynamic rendering, which the per-request CSP
  // nonce set in proxy.ts requires (Next.js applies the nonce to its own scripts automatically).
  await headers();
  const env = tryGetPublicEnv();

  return (
    <html
      lang="en"
      className={`${inter.variable} ${pressStart.variable} ${silkscreen.variable} ${jetbrains.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-abyss text-slate-100 antialiased">
        <RuntimeConfigProvider
          value={
            env
              ? { supabaseUrl: env.supabaseUrl, supabaseAnonKey: env.supabaseAnonKey, livekitUrl: env.livekitUrl, siteUrl: env.siteUrl }
              : null
          }
        >
          {children}
        </RuntimeConfigProvider>
        <AppToaster />
      </body>
    </html>
  );
}
