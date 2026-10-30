import { forwardRef, type AnchorHTMLAttributes } from "react";
import { useRouter } from "./navigation";
export default forwardRef<
  HTMLAnchorElement,
  AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }
>(function Link({ href, prefetch, onClick, ...props }, ref) {
  const router = useRouter();
  void prefetch;
  return (
    <a
      {...props}
      href={href}
      ref={ref}
      onClick={(event) => {
        onClick?.(event);
        if (
          !event.defaultPrevented &&
          !event.metaKey &&
          !event.ctrlKey &&
          href.startsWith("/")
        ) {
          event.preventDefault();
          router.push(href);
        }
      }}
    />
  );
});
