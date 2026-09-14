export function getImageUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("/objects/")) return `/api/storage${path}`;
  return path;
}