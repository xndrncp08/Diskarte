/** "Mention" from a person's menu: asks the open chat composer to insert `@username `. */
const EVENT = "diskarte:mention";

export function requestMention(username: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: username }));
}

export function onMentionRequest(handler: (username: string) => void) {
  const listener = (e: Event) => {
    const username = (e as CustomEvent<unknown>).detail;
    if (typeof username === "string" && username) handler(username);
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
