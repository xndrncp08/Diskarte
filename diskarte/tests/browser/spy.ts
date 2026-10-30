// The shared in-memory database uses spies in unit tests; the browser only needs the functions.
export const vi = { fn: <T>(implementation: T): T => implementation };
