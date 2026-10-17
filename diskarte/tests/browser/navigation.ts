import { useSyncExternalStore } from "react";
const subscribe = (listener: () => void) => {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
};
const snapshot = () => window.location.pathname + window.location.search;
export function usePathname() {
  return useSyncExternalStore(subscribe, snapshot).split("?")[0];
}
export function useSearchParams() {
  useSyncExternalStore(subscribe, snapshot);
  return new URLSearchParams(window.location.search);
}
function push(path: string) {
  history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
const router = {
  push,
  replace: push,
  refresh: () => window.dispatchEvent(new PopStateEvent("popstate")),
  back: () => history.back(),
  prefetch: async () => {},
};
export const useRouter = () => router;
export function useParams() {
  const parts = usePathname().split("/");
  return { serverId: parts[2], channelId: parts[3] };
}
export function redirect(path: string): never {
  router.replace(path);
  throw new Error(`Fixture redirect: ${path}`);
}
export function notFound(): never {
  throw new Error("Fixture route not found");
}
