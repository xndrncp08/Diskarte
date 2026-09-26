"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { isOptimizable } from "@/lib/image-hosts";

/** Tiny navy→gold blur shown while the optimised image streams in. */
export const BLUR_DATA_URL =
  "data:image/svg+xml;base64," +
  (typeof btoa === "function" ? btoa : (s: string) => Buffer.from(s).toString("base64"))(
    '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1e293b"/><stop offset="1" stop-color="#3b2f12"/></linearGradient></defs><rect width="8" height="8" fill="url(#g)"/></svg>',
  );

interface SmartImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  fill?: boolean;
  sizes?: string;
  className?: string;
  style?: CSSProperties;
  priority?: boolean;
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
}

/**
 * next/image (AVIF/WebP, responsive srcset, lazy loading, blur placeholder) for hosts the optimiser
 * is configured for; a plain lazy <img> for anything else, so an unexpected host never breaks a render.
 */
export function SmartImage({ src, alt, width, height, fill, sizes, className, style, priority, referrerPolicy = "no-referrer" }: SmartImageProps) {
  if (isOptimizable(src, process.env.NEXT_PUBLIC_IMAGE_HOSTS)) {
    return (
      <Image
        src={src}
        alt={alt}
        {...(fill ? { fill: true } : { width: width ?? 64, height: height ?? 64 })}
        sizes={sizes ?? (fill ? "100vw" : `${width ?? 64}px`)}
        className={className}
        style={style}
        priority={priority}
        placeholder="blur"
        blurDataURL={BLUR_DATA_URL}
        referrerPolicy={referrerPolicy}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fallback for hosts the optimiser doesn't accept
    <img
      src={src}
      alt={alt}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy={referrerPolicy}
      className={className}
      style={fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style}
    />
  );
}
