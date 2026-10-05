import Link from "next/link";
import { AuthEntrance } from "@/components/motion/AuthEntrance";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main>
      <AuthEntrance
        tagline="Walang Shutdown-Shutdown"
        footer={
          <p className="mt-6 text-center text-xs text-slate-500">
            <Link href="/" className="inline-flex items-center rounded-md px-2 text-slate-400 hover:text-sun pointer-coarse:min-h-11" aria-label="Diskarte home">
              Back to home
            </Link>
          </p>
        }
      >
        {children}
      </AuthEntrance>
    </main>
  );
}
