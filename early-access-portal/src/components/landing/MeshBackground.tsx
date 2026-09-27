/**
 * Ambient mesh glow: three large blurred blobs drifting slowly on the compositor (transform only).
 * Fixed and pointer-transparent; frozen by the global reduced-motion rule.
 */
export function MeshBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-0 overflow-hidden" aria-hidden>
      <div className="absolute -right-[10%] -top-[20%] size-[60vmax] animate-mesh rounded-full bg-[radial-gradient(circle,rgba(255,184,0,0.22),transparent_60%)] blur-3xl will-change-transform" />
      <div
        className="absolute -bottom-[25%] -left-[15%] size-[55vmax] animate-mesh rounded-full bg-[radial-gradient(circle,rgba(0,56,168,0.35),transparent_60%)] blur-3xl will-change-transform"
        style={{ animationDelay: "-6s", animationDuration: "22s" }}
      />
      <div
        className="absolute left-[35%] top-[40%] size-[35vmax] animate-mesh rounded-full bg-[radial-gradient(circle,rgba(206,17,38,0.14),transparent_60%)] blur-3xl will-change-transform"
        style={{ animationDelay: "-12s", animationDuration: "26s" }}
      />
    </div>
  );
}
