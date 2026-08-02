import { ImageOff } from "lucide-react";
import Image from "next/image";

export function HistoryImage({
  src,
  alt,
  className = "",
  sizes,
  preload = false,
}: {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  preload?: boolean;
}) {
  if (!src) {
    return (
      <div className={`image-placeholder ${className}`} role="img" aria-label={alt || "이미지 준비 중"}>
        <span className="placeholder-orbit" />
        <ImageOff size={20} strokeWidth={1.5} aria-hidden="true" />
        <span>ARCHIVE IMAGE</span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      className={className}
      fill
      sizes={sizes}
      preload={preload}
    />
  );
}
