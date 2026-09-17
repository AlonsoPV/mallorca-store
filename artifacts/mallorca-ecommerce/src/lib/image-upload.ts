import { getImageUrl } from "@/lib/image-url";

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
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

export async function uploadImageFile(file: File): Promise<string> {
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
      name: file.name,
      size: file.size,
      contentType: file.type,
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
    request.setRequestHeader("Content-Type", file.type);
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error("El almacenamiento rechazó la imagen."));
    request.onerror = () => reject(new Error("No se pudo completar la subida."));
    request.send(file);
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
