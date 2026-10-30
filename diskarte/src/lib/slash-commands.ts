/** Built-in composer commands: plain text transforms, no bots involved. */
export const SLASH_COMMANDS = [
  { name: "shrug", hint: "Appends ¯\\_(ツ)_/¯" },
  { name: "tableflip", hint: "Appends (╯°□°)╯︵ ┻━┻" },
  { name: "unflip", hint: "Appends ┬─┬ノ( º _ ºノ)" },
  { name: "me", hint: "Says it as an action, in italics" },
  { name: "spoiler", hint: "Hides it behind a spoiler" },
] as const;

const append = (text: string, suffix: string) => (text ? `${text} ${suffix}` : suffix);

/**
 * Applies a leading `/command` to a message. Unknown commands (and anything that isn't one) go out
 * unchanged, so "/r/philippines" still sends as typed. Kaomoji are markdown-escaped.
 */
export function applySlashCommand(content: string): string {
  const match = /^\/([a-z]+)(?:\s+([\s\S]*))?$/i.exec(content);
  if (!match) return content;
  const text = (match[2] ?? "").trim();
  switch (match[1].toLowerCase()) {
    case "shrug":
      return append(text, "¯\\\\\\_(ツ)\\_/¯");
    case "tableflip":
      return append(text, "(╯°□°)╯︵ ┻━┻");
    case "unflip":
      return append(text, "┬─┬ノ( º \\_ ºノ)");
    case "me":
      return text ? `_${text.replace(/_/g, "\\_")}_` : content;
    case "spoiler":
      return text ? `||${text.replace(/\|\|/g, "| |")}||` : content;
    default:
      return content;
  }
}

/** Commands matching what's typed so far ("/sh" → shrug), while only the command word is typed. */
export function slashSuggestions(draft: string) {
  const match = /^\/([a-z]*)$/i.exec(draft);
  if (!match) return [];
  return SLASH_COMMANDS.filter((c) => c.name.startsWith(match[1].toLowerCase()));
}
