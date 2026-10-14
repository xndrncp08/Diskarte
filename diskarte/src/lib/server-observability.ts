import "server-only";

/** Route templates are safe; actual URLs, query strings, headers and error messages are excluded. */
export function requestErrorRecord(error: unknown, method: string, route: string, routeType: string) {
  const object = error && typeof error === "object" ? error as { name?: unknown; digest?: unknown } : {};
  const names = ["Error", "TypeError", "RangeError", "MissingEnvError"];
  const kind = typeof object.name === "string" && names.includes(object.name) ? object.name : "Error";
  const digest = typeof object.digest === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(object.digest) ? object.digest : undefined;
  return { level: "error", event: "request.failed", at: new Date().toISOString(), method: /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(method) ? method : "OTHER", route: route.split("?")[0].slice(0, 200), routeType, errorKind: kind, ...(digest ? { digest } : {}) };
}
