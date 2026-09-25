export type LegalBlock =
  | { type: "section"; id: string; text: string }
  | { type: "subheading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

export type LegalDoc = {
  title: string;
  updated: string | null;
  blocks: LegalBlock[];
};

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Input is plain text, not markdown: one block per line, headings without markup,
 * and list items prefixed with "–" (several can share one line).
 */
export function parseLegalDoc(raw: string): LegalDoc {
  const lines = raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const [title = "", ...rest] = lines;
  let updated: string | null = null;
  const blocks: LegalBlock[] = [];

  for (const line of rest) {
    if (/^Última actualización/i.test(line)) {
      updated = line.split(":").slice(1).join(":").trim() || line;
      continue;
    }
    if (/^Sección\s+\d+/i.test(line) || line.endsWith("?")) {
      blocks.push({ type: "section", id: slugify(line), text: line });
      continue;
    }
    if (line.startsWith("–")) {
      const items = line
        .replace(/^–\s*/, "")
        .split(/\s–\s/)
        .map((item) => item.trim())
        .filter(Boolean);
      const previous = blocks[blocks.length - 1];
      if (previous?.type === "list") previous.items.push(...items);
      else blocks.push({ type: "list", items });
      continue;
    }
    if (line.length <= 60 && !/[.:,;]$/.test(line) && !/^\S+@\S+$/.test(line)) {
      blocks.push({ type: "subheading", text: line });
      continue;
    }
    blocks.push({ type: "paragraph", text: line });
  }

  return { title, updated, blocks };
}
