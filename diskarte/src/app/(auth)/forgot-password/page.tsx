import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { ConfigNotice } from "@/components/ConfigNotice";
import { tryGetPublicEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Forgot your password?</h1>
        <p className="mt-1 text-sm text-slate-400">Enter your email and we&apos;ll send you a reset link.</p>
      </div>
      {tryGetPublicEnv() ? <ForgotPasswordForm /> : <ConfigNotice />}
    </div>
  );
}
