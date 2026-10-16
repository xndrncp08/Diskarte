import { AuthFrame } from "@/components/auth/AuthFrame";

/** Public credential pages share presentation, not authentication state. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return <AuthFrame>{children}</AuthFrame>;
}
