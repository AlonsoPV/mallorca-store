# Ampliación del modelo de productos — Auditoría y plan (§37)

Fuente: brief de ampliación (categorías N:M, etiquetas, inventario, promociones, cross-sell, una sola fuente de verdad).

**Estado: implementado** (Fases 1–4). Migración aditiva + dual-write; backfill en `lib/db/src/scripts/backfill-product-relations.sql`.

## Entregado

- Schema: `product_categories`, `tags`, `product_tags`, `product_cross_sells`, `catalog_change_log`
- Dominio: `upsertProductAggregate` en `artifacts/api-server/src/lib/product-aggregate.ts`
- API OpenAPI: `categoryIds`, `primaryCategoryId`, `tags`, `crossSellProductIds`, bulk/import `relationMode`
- UI: multiselect categorías, tags chips, cross-sell picker; quick-edit; bulk ampliado; import updateFields + relationMode
- Export reimportable con categories/tags/promo/cross_sell_skus
- Storefront: filtro por cualquier categoría; PDP “Combina bien con”
- Tests: `product-aggregate.test.ts`

## Compatibilidad

- `products.category_id` y `products.tags[]` se dual-escriben
- CSVs con `categoryId` siguen válidos
- Tras `drizzle push`, ejecutar el SQL de backfill

## Criterio de aceptación

Crear (o importar) un producto con múltiples categorías, etiquetas, inventario por sucursal, promoción y cross-sells desde una sola operación de dominio.
