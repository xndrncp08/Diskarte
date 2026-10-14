import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Diskarte — Ang Bagong Istambayan ng Bayan",
    short_name: "Diskarte",
    description: "Tara, Tambay Tayo. Ang Bagong Istambayan ng Bayan.",
    start_url: "/tambayan",
    id: "/tambayan",
    scope: "/",
    shortcuts: [
      { name: "Messages", url: "/tambayan/messages", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Explore", url: "/tambayan/explore", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
    display: "standalone",
    background_color: "#020617",
    theme_color: "#0F172A",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
