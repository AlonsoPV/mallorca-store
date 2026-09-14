import { useMemo, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

type Props = {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  label?: string;
};

export function TagInput({
  value,
  onChange,
  suggestions = [],
  label = "Etiquetas",
}: Props) {
  const [query, setQuery] = useState("");

  const filteredSuggestions = useMemo(() => {
    const q = normalize(query);
    const have = new Set(value.map(normalize));
    return suggestions
      .filter((tag) => !have.has(normalize(tag)))
      .filter((tag) => !q || normalize(tag).includes(q))
      .slice(0, 8);
  }, [query, suggestions, value]);

  function addTag(raw: string) {
    const name = raw.trim();
    if (!name) return;
    const key = normalize(name);
    if (value.some((tag) => normalize(tag) === key)) {
      setQuery("");
      return;
    }
    onChange([...value, name]);
    setQuery("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(query);
    }
    if (event.key === "Backspace" && !query && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 pr-1">
            {tag}
            <button
              type="button"
              className="rounded-sm p-0.5 hover:bg-muted"
              onClick={() => onChange(value.filter((item) => item !== tag))}
              aria-label={`Quitar ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Buscar o crear etiqueta… (Enter)"
      />
      {!!filteredSuggestions.length && (
        <div className="flex flex-wrap gap-2">
          {filteredSuggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
              onClick={() => addTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
