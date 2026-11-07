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
  // Home: welcome, getting started, what's new
  "Welcome to Diskarte": "Maligayang pagdating sa Diskarte", "Welcome back": "Welcome back",
  "Find your people: start a Tambayan, add friends and say hello.": "Hanapin ang tropa mo: gumawa ng Tambayan, mag-add ng kaibigan, at mag-hello.",
  "Your people. Your plans. Pick up where you left off.": "Ang tropa mo. Ang mga plano mo. Ituloy kung saan ka tumigil.",
  "Getting started": "Pagsisimula", "A few steps to make Diskarte yours.": "Ilang hakbang para maging iyo ang Diskarte.",
  "Hide getting started": "Itago ang pagsisimula", "steps done": "hakbang ang tapos", done: "tapos na",
  "Join or create a Tambayan": "Sumali o gumawa ng Tambayan", "Start your own with a template, or find one in Explore.": "Gumawa ng sarili mo gamit ang template, o maghanap sa Tuklasin.",
  Create: "Gumawa", "Add a friend": "Mag-add ng kaibigan", "Friends can message you and see your Moments.": "Puwede kang i-message ng mga kaibigan at makita nila ang Moments mo.",
  "Add Friend": "Mag-add ng kaibigan", "Say hello": "Mag-hello", "Send your first message in a DM or a channel.": "Ipadala ang una mong mensahe sa DM o sa isang channel.",
  "Install Diskarte": "I-install ang Diskarte", "Get it on your home screen, with notifications.": "Ilagay sa home screen mo, kasama ang mga abiso.",
  "How to install": "Paano i-install", "What's new": "Ano'ng bago", updates: "update", "Mark updates as read": "Markahang nabasa na ang mga update",
  "Read the full update": "Basahin ang buong update", "All updates": "Lahat ng update",
  Help: "Tulong", "opens the Help Center in a new tab": "bubuksan ang Help Center sa bagong tab", "Community help": "Tulong sa komunidad",
  "How it works": "Paano ito gumagana", "Setting up channels": "Pag-set up ng mga channel", "Help with this": "Tulong dito", "Help Center": "Help Center", "Trouble connecting?": "Hindi makakonekta?",
};
export function translate(text: string, language: "en" | "fil") { return language === "fil" ? filipino[text] ?? text : text; }
export function useLocale() {
  const { language } = useDisplayPrefs();
  return { language, t: (text: string) => translate(text, language) };
}
