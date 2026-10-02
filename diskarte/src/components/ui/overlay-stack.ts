/**
 * Open overlays (modals, floating windows), most recent last. Only the topmost one answers Escape
 * and traps Tab, so a confirmation opened over the Settings window closes on its own.
 */
const stack: symbol[] = [];

export function pushOverlay(): symbol {
  const token = Symbol("overlay");
  stack.push(token);
  return token;
}

export function removeOverlay(token: symbol) {
  const i = stack.indexOf(token);
  if (i >= 0) stack.splice(i, 1);
}

export function isTopOverlay(token: symbol) {
  return stack[stack.length - 1] === token;
}

/** Bring an already open overlay to the top (a floating window that was clicked). */
export function raiseOverlay(token: symbol) {
  removeOverlay(token);
  stack.push(token);
}
