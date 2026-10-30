import type { ImgHTMLAttributes } from "react";
export default function Image({
  unoptimized,
  preload,
  fill,
  alt,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & {
  unoptimized?: boolean;
  preload?: boolean;
  fill?: boolean;
}) {
  void unoptimized;
  void preload;
  void fill;
  // eslint-disable-next-line @next/next/no-img-element -- browser fixture has no Next image server
  return <img {...props} alt={alt} />;
}
