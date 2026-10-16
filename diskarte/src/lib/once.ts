/**
 * Remembers recently seen ids so a duplicated or replayed realtime event (reconnects, two
 * subscriptions racing) can't ping or alert twice for the same message. Bounded.
 */
export function createOnce(limit = 500) {
  const seen = new Set<string>();
  return (id: string) => {
    if (seen.has(id)) return false;
    seen.add(id);
    if (seen.size > limit) seen.delete(seen.values().next().value!);
    return true;
  };
}
