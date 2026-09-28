import Image from "next/image";
import type { HomeImage } from "@/data/homeAssets";

type Props = {
  image: HomeImage;
  /** Used when the slot has no designed file yet (a live Wix photo). */
  fallbackSrc?: string;
  sizes: string;
  priority?: boolean;
  className?: string;
  quality?: number;
};

/**
 * A filled image for a design-brief slot. In development, placeholder slots show
 * their brief ID so it's clear which delivered file goes where.
 */
const AssetImage = ({ image, fallbackSrc, sizes, priority, className = "", quality = 75 }: Props) => {
  const src = image.src || fallbackSrc;
  const showTag = image.placeholder && process.env.NODE_ENV !== "production";

  return (
    <>
      {src ? (
        <Image
          src={src}
          alt={image.alt}
          fill
          sizes={sizes}
          quality={quality}
          priority={priority}
          className={`object-cover ${className}`}
          style={image.position ? { objectPosition: image.position } : undefined}
        />
      ) : (
        <div className="absolute inset-0 bg-platinum" aria-hidden="true" />
      )}
      {showTag && (
        <span className="pointer-events-none absolute right-1 top-1 z-30 bg-yellow-300/90 px-1.5 py-0.5 font-mono text-[9px] font-bold text-black">
          {image.briefId}
        </span>
      )}
    </>
  );
};

export default AssetImage;
