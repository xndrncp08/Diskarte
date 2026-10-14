import { useSyncExternalStore } from "react";

export type DiagnosticScope = "realtime" | "call" | "message" | "client";
export type DiagnosticEvent = "connected" | "reconnecting" | "disconnected" | "error" | "quality-poor" | "quality-good" | "failed" | "recovered";
export interface Diagnostic { at: string; scope: DiagnosticScope; event: DiagnosticEvent; latencyMs?: number }
const EMPTY: readonly Diagnostic[] = [];
let records: readonly Diagnostic[] = EMPTY;
const listeners = new Set<() => void>();
/** Session-only metadata. No message content, user identifiers, paths, tokens or exception strings. */
export function recordDiagnostic(scope: DiagnosticScope, event: DiagnosticEvent, latencyMs?: number) {
  records = [...records, { at: new Date().toISOString(), scope, event, ...(latencyMs === undefined ? {} : { latencyMs: Math.max(0, Math.min(300000, Math.round(latencyMs))) }) }].slice(-100);
  listeners.forEach((listener) => listener());
}
export function clearDiagnostics() { records = EMPTY; listeners.forEach((listener) => listener()); }
export function diagnosticSnapshot() { return records; }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useDiagnostics() { return useSyncExternalStore(subscribe, diagnosticSnapshot, () => EMPTY); }
