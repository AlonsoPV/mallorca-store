export type CatalogChangeReason =
  | "product"
  | "promotion"
  | "inventory";

export type CatalogChangeEvent = {
  productId: number;
  reason: CatalogChangeReason;
  changedAt: string;
};

type CatalogChangeListener = (event: CatalogChangeEvent) => void;

const listeners = new Set<CatalogChangeListener>();

export function publishCatalogChange(
  productId: number,
  reason: CatalogChangeReason,
): void {
  const event: CatalogChangeEvent = {
    productId,
    reason,
    changedAt: new Date().toISOString(),
  };
  for (const listener of listeners) listener(event);
}

export function subscribeToCatalogChanges(
  listener: CatalogChangeListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}