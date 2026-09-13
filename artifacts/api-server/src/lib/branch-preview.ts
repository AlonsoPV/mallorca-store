export interface BranchPreviewRow {
  item: {
    productId: number;
    variantId: number | null;
    quantity: number;
  };
  product: {
    id: number;
    name: string;
    status: string;
    price: number;
    salePrice: number | null;
  };
  branchProduct?: {
    available: boolean;
    inventory: number;
    priceOverride: number | null;
    salePriceOverride: number | null;
  } | null;
}

export interface BranchPreviewItem {
  productId: number;
  variantId: number | null;
  name: string;
  quantity: number;
  available: boolean;
  inventory: number;
  price: number;
  salePrice: number | null;
}

export function buildBranchPreviewItems(
  rows: readonly BranchPreviewRow[],
): BranchPreviewItem[] {
  return rows.map(({ item, product, branchProduct }) => {
    const available = Boolean(
      branchProduct?.available &&
        branchProduct.inventory >= item.quantity &&
        product.status === "active",
    );

    return {
      productId: product.id,
      variantId: item.variantId,
      name: product.name,
      quantity: item.quantity,
      available,
      inventory: branchProduct?.inventory ?? 0,
      price: branchProduct?.priceOverride ?? product.price,
      salePrice: branchProduct?.salePriceOverride ?? product.salePrice,
    };
  });
}