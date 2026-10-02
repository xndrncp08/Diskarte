import { TriangleAlert } from "lucide-react";

/** Shown instead of auth/app UI when the deployment is missing Supabase/LiveKit configuration. */
export function ConfigNotice() {
  return (
    <div role="alert" className="space-y-2 rounded-xl border border-sun/30 bg-sun/10 p-4 text-sm text-amber-100">
      <p className="flex items-center gap-2 font-bold text-sun">
        <TriangleAlert className="size-4" aria-hidden /> Missing configuration
      </p>
      <p>
        Set <code className="font-mono">SUPABASE_URL</code>, <code className="font-mono">SUPABASE_ANON_KEY</code> and{" "}
        <code className="font-mono">LIVEKIT_URL</code> on the server, then restart. See DEPLOYMENT.md.
      </p>
    </div>
  );
}
