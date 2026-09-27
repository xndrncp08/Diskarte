import { useSyncExternalStore } from "react";

/**
 * In-memory stand-in for the Next.js App Router so components that call useRouter / usePathname /
 * useParams (and <Link>) can navigate inside jsdom. Tests read and drive it via `navigation`.
 */
type Listener = () => void;
const listeners = new Set<Listener>();
let current = "/";

function emit() {
  listeners.forEach((l) => l());
}

export const navigation = {
  get path() {
    return current;
  },
  history: [] as string[],
  set(path: string) {
    current = path;
    emit();
  },
  push(href: string) {
    navigation.history.push(href);
    current = href;
    emit();
  },
  replace(href: string) {
    current = href;
    emit();
  },
  refresh() {},
  reset(path = "/") {
    navigation.history = [];
    current = path;
    emit();
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function usePathnameMock() {
  return useSyncExternalStore(navigation.subscribe, () => current.split("?")[0], () => current.split("?")[0]);
}

/** Derives dynamic segments for the app's `/tambayan/[serverId]/[channelId]` routes. */
export function paramsFor(path: string): Record<string, string> {
  const [, root, serverId, channelId] = path.split("?")[0].split("/");
  if (root !== "tambayan") return {};
  return { ...(serverId ? { serverId } : {}), ...(channelId ? { channelId } : {}) };
}
