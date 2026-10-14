import type { Instrumentation } from "next";
import { requestErrorRecord } from "@/lib/server-observability";
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  // Request/error payloads often contain credentials or private content; log only safe metadata.
  console.error(JSON.stringify(requestErrorRecord(error, request.method, context.routePath, context.routeType)));
};
