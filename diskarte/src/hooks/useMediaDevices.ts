"use client";

import { useEffect, useState } from "react";

const REFRESH = "diskarte:devices";

/** Re-list devices (call after a permission prompt: names only appear once access is granted). */
export function refreshMediaDevices() {
  window.dispatchEvent(new Event(REFRESH));
}

/** Lists audio/video devices of one kind; labels appear once the browser has granted access. */
export function useMediaDevices(kind: MediaDeviceKind) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!media?.enumerateDevices) return;
    let cancelled = false;
    const load = () =>
      media
        .enumerateDevices()
        .then((all) => !cancelled && setDevices(all.filter((d) => d.kind === kind && d.deviceId)))
        .catch(() => undefined);
    void load();
    media.addEventListener?.("devicechange", load);
    window.addEventListener(REFRESH, load);
    return () => {
      cancelled = true;
      media.removeEventListener?.("devicechange", load);
      window.removeEventListener(REFRESH, load);
    };
  }, [kind]);
  return devices;
}
