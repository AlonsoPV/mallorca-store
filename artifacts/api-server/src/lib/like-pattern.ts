export function likeContainsPattern(raw: string): string | null {
  const cleaned = raw.replace(/[%_\\]/g, "").trim();
  if (!cleaned) return null;
  return `%${cleaned}%`;
}
