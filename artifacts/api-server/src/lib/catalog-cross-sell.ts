export type CrossSellAvailability = {
  branchId: number;
  available: boolean;
  inventory: number;
};

export type CrossSellCard = {
  id: number;
  availability: CrossSellAvailability[];
};

export function filterCrossSellCards<T extends CrossSellCard>(
  productIds: number[],
  cards: T[],
  branchId?: number,
): T[] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  return productIds
    .map((id) => byId.get(id))
    .filter((card): card is T => {
      if (!card) return false;
      if (branchId == null) return true;
      return card.availability.some(
        (item) => item.branchId === branchId && item.available && item.inventory > 0,
      );
    })
    .slice(0, 6);
}
