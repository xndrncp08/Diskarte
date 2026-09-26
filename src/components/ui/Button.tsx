import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "glass";
type Size = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary: "bg-sun text-abyss hover:bg-[#ffc52e] shadow-[0_3px_0_0_#b45309] active:shadow-none active:translate-y-[3px]",
  secondary: "bg-white/10 text-slate-100 hover:bg-white/15 border border-white/10",
  ghost: "text-slate-300 hover:bg-white/10 hover:text-white",
  danger: "bg-red-500/90 text-white hover:bg-red-500 shadow-[0_3px_0_0_#7f1d1d] active:shadow-none active:translate-y-[3px]",
  glass: "glass text-slate-100 hover:bg-white/10",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
  icon: "h-9 w-9",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, disabled, className, children, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold select-none",
        "transition-[background-color,transform,box-shadow,color] duration-150 ease-out",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});
