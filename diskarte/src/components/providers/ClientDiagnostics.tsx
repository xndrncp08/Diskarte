"use client";
import { useEffect } from "react";
import { recordDiagnostic } from "@/lib/diagnostics";
export function ClientDiagnostics() {
  useEffect(() => {
    const record = () => recordDiagnostic("client", "error");
    window.addEventListener("error", record); window.addEventListener("unhandledrejection", record);
    return () => { window.removeEventListener("error", record); window.removeEventListener("unhandledrejection", record); };
  }, []);
  return null;
}
