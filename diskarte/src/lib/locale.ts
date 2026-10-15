"use client";
import { useDisplayPrefs } from "./display-prefs";
const filipino: Record<string, string> = {
  Home: "Tahanan", Messages: "Mga mensahe", Explore: "Tuklasin", Profile: "Profil", Friends: "Mga kaibigan", Search: "Maghanap",
  "Main destinations": "Mga pangunahing pahina", "Return to call": "Bumalik sa tawag", "Leave call": "Umalis sa tawag",
  "My Profile": "Aking profil", "Account & Sessions": "Account at mga session", "Privacy & Safety": "Pagkapribado at kaligtasan",
  Appearance: "Hitsura", Accessibility: "Accessibility", "Voice & Video": "Boses at video", Chat: "Usapan", Notifications: "Mga abiso",
  Advanced: "Mga advanced na setting", "Report a problem": "Mag-ulat ng problema", "Language & Region": "Wika at rehiyon",
  "Color mode": "Kulay ng interface", Dark: "Madilim", Light: "Maliwanag", System: "Ayon sa device", Theme: "Tema",
  Language: "Wika", "Time zone": "Sona ng oras", "Use device time zone": "Gamitin ang sona ng oras ng device",
  "Use 24-hour time": "Gumamit ng 24-oras na oras", "Date preview": "Halimbawa ng petsa",
};
export function translate(text: string, language: "en" | "fil") { return language === "fil" ? filipino[text] ?? text : text; }
export function useLocale() {
  const { language } = useDisplayPrefs();
  return { language, t: (text: string) => translate(text, language) };
}
