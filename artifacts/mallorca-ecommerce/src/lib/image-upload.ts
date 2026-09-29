import { getImageUrl } from "@/lib/image-url";

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const MAX_OPTIMIZED_IMAGE_DIMENSION = 2560;
const JPEG_OPTIMIZATION_QUALITY = 0.94;
const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

export type ImageAssetStatus = "uploaded" | "uploading" | "error";

export type ImageAsset = {
  id: string;
  file?: File;
  previewUrl: string;
  path?: string;
  fileName: string;
  status: ImageAssetStatus;
  progress: number;
  error?: string;
};

export function nextImageId() {
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function assetsFromPaths(
  mainPath: string | null | undefined,
  gallery: string[] = [],
): ImageAsset[] {
  const paths = [mainPath, ...gallery].filter(Boolean) as string[];
  return paths.map((path, index) => ({
    id: nextImageId(),
    previewUrl: getImageUrl(path) || path,
    path,
    fileName: index === 0 ? "Principal" : `Galería ${index}`,
    status: "uploaded" as const,
    progress: 100,
  }));
}

async function optimizeImageForUpload(file: File): Promise<File> {
  // Keep formats with transparency, animation, or already-compressed modern
  // codecs byte-for-byte. Only downscale very large JPEGs for storefront use.
  if (
    file.type !== "image/jpeg" ||
    typeof createImageBitmap !== "function" ||
    typeof document === "undefined"
  ) {
    return file;
  }

  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    const longestSide = Math.max(bitmap.width, bitmap.height);
    if (longestSide <= MAX_OPTIMIZED_IMAGE_DIMENSION) return file;

    const scale = MAX_OPTIMIZED_IMAGE_DIMENSION / longestSide;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    const optimizedBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_OPTIMIZATION_QUALITY),
    );
    if (!optimizedBlob || optimizedBlob.size >= file.size) return file;

    return new File([optimizedBlob], file.name, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    // Optimization is best-effort; a browser decoding/canvas limitation must
    // never make an otherwise valid original image impossible to upload.
    return file;
  } finally {
    bitmap?.close();
  }
}

export async function uploadImageFile(file: File): Promise<string> {
  const uploadFile = await optimizeImageForUpload(file);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // Local mock + api-client token getter both use this bearer for admin routes.
  try {
    const { LOCAL_DEV_AUTH_TOKEN, readLocalDevSignedIn } = await import("@/lib/local-dev-user");
    if (readLocalDevSignedIn()) {
      headers.Authorization = `Bearer ${LOCAL_DEV_AUTH_TOKEN}`;
    }
  } catch {
    /* ignore */
  }

  const response = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({
      name: uploadFile.name,
      size: uploadFile.size,
      contentType: uploadFile.type,
    }),
  });
  if (!response.ok) throw new Error("No se pudo preparar la subida.");
  const upload = (await response.json()) as { uploadURL?: string; objectPath?: string };
  if (!upload.uploadURL || !upload.objectPath) {
    throw new Error("La respuesta de almacenamiento no es válida.");
  }

  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", upload.uploadURL!, true);
    request.setRequestHeader("Content-Type", uploadFile.type);
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error("El almacenamiento rechazó la imagen."));
    request.onerror = () => reject(new Error("No se pudo completar la subida."));
    request.send(uploadFile);
  });

  return upload.objectPath;
}

export function validateImageFiles(files: File[]): { accepted: File[]; rejected: string[] } {
  const accepted: File[] = [];
  const rejected: string[] = [];
  for (const file of files) {
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      rejected.push(`${file.name}: formato no compatible`);
      continue;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      rejected.push(`${file.name}: supera 8 MB`);
      continue;
    }
    accepted.push(file);
  }
  return { accepted, rejected };
}
