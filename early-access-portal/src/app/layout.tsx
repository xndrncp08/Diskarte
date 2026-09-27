import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Inter, JetBrains_Mono, Press_Start_2P, Silkscreen } from "next/font/google";
import { MotionRoot } from "@/components/motion/MotionRoot";
import { tryGetPortalEnv } from "@/lib/env";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const pressStart = Press_Start_2P({ variable: "--font-press-start", weight: "400", subsets: ["latin"], display: "swap" });
const silkscreen = Silkscreen({ variable: "--font-silkscreen", weight: ["400", "700"], subsets: ["latin"], display: "swap" });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const env = tryGetPortalEnv();
  return {
    metadataBase: new URL(env?.siteUrl ?? "http://localhost:3100"),
    title: { default: "Diskarte Early Access — Mauna sa bagong istambayan", template: "%s · Diskarte Early Access" },
    description: "Mag-apply para sa unang batch ng Diskarte, ang open-source na Discord alternative para sa Pinoy gamers, estudyante at creators.",
    icons: { icon: "/brand/logo.svg" },
    openGraph: { type: "website", siteName: "Diskarte Early Access", locale: "en_PH", images: ["/email/salakot.png"] },
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
  // Dynamic rendering: the per-request CSP nonce from proxy.ts must reach Next's scripts.
  await headers();
  return (
    <html lang="en" className={`${inter.variable} ${pressStart.variable} ${silkscreen.variable} ${jetbrains.variable} h-full`}>
      <body className="min-h-full overflow-x-hidden bg-abyss text-slate-100 antialiased">
        <MotionRoot>{children}</MotionRoot>
      </body>
    </html>
  );
}
