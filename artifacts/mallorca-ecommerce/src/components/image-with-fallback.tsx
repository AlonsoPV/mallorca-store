import { useEffect, useState, type ReactNode } from "react";
import { getImageUrl } from "@/lib/image-url";

type ImageWithFallbackProps = {
  src?: string | null;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
  fallback?: ReactNode;
};

export function ImageWithFallback({
  src,
  alt,
  className,
  loading,
  fallback,
}: ImageWithFallbackProps) {
  const [failed, setFailed] = useState(false);
  const resolvedSrc = getImageUrl(src);

  useEffect(() => {
    setFailed(false);
  }, [resolvedSrc]);

  if (!resolvedSrc || failed) {
    return (
      fallback ?? (
        <div
          role="img"
          aria-label={`${alt}: imagen no disponible`}
          className={`${className || ""} flex items-center justify-center bg-secondary text-center text-xs text-muted-foreground`}
        >
          Imagen no disponible
        </div>
      )
    );
  }

  return <img src={resolvedSrc} alt={alt} className={className} loading={loading} onError={() => setFailed(true)} />;
}