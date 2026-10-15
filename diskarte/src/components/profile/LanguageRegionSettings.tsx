"use client";
import { useState } from "react";
import { setDisplayPrefs, useDisplayPrefs, validTimeZone } from "@/lib/display-prefs";
import { useLocale } from "@/lib/locale";
import { Switch } from "@/components/ui/Switch";
export function LanguageRegionSettings() {
  const prefs = useDisplayPrefs(), { t } = useLocale();
  const [zone, setZone] = useState(prefs.timeZone === "system" ? "" : prefs.timeZone), [error, setError] = useState("");
  const field = "mt-1 min-h-11 w-full rounded-lg border border-white/15 bg-midnight px-3 text-base";
  return <div className="max-w-md space-y-5">
    <label className="block text-sm font-semibold">{t("Language")}<select value={prefs.language} onChange={(e) => setDisplayPrefs({ language: e.target.value === "fil" ? "fil" : "en" })} className={field}><option value="en">English</option><option value="fil">Filipino</option></select></label>
    <p className="text-sm text-slate-400">Core navigation and settings are available in English and Filipino. User-written content keeps its original language.</p>
    <label className="block text-sm font-semibold">{t("Time zone")}<input value={zone} onChange={(e) => setZone(e.target.value)} placeholder="Asia/Manila" className={field} list="diskarte-timezones" aria-invalid={!!error} aria-describedby="timezone-error" /></label>
    <datalist id="diskarte-timezones">{["Asia/Manila","UTC","America/Edmonton","America/Los_Angeles","Europe/London","Asia/Tokyo"].map((zone) => <option key={zone} value={zone} />)}</datalist>
    <div className="flex flex-wrap gap-2"><button type="button" className="min-h-11 rounded-lg bg-white/10 px-3" onClick={() => { if (!validTimeZone(zone)) return setError("Enter a valid IANA time zone, such as Asia/Manila."); setDisplayPrefs({ timeZone: zone }); setError(""); }}>Apply time zone</button><button type="button" className="min-h-11 rounded-lg bg-white/10 px-3" onClick={() => { setDisplayPrefs({ timeZone: "system" }); setZone(""); setError(""); }}>{t("Use device time zone")}</button></div>
    <p id="timezone-error" role={error ? "alert" : undefined} className="text-sm text-amber-200">{error}</p>
    <p className="text-sm text-slate-400">Current: {prefs.timeZone === "system" ? "Device time zone" : prefs.timeZone}</p>
    <Switch checked={prefs.hour24} onChange={(hour24) => setDisplayPrefs({ hour24 })} label={t("Use 24-hour time")} />
  </div>;
}
