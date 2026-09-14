-- Backfill product_categories / tags / product_tags from legacy columns.
-- Safe to re-run (ON CONFLICT DO NOTHING). Run after drizzle push creates the new tables.

INSERT INTO product_categories (product_id, category_id, is_primary)
SELECT id, category_id, true
FROM products
ON CONFLICT DO NOTHING;

-- Expand products.tags text[] into tags + product_tags (slug = lower(trim(name)))
WITH expanded AS (
  SELECT
    p.id AS product_id,
    trim(t.tag) AS name,
    lower(trim(t.tag)) AS slug
  FROM products p
  CROSS JOIN LATERAL unnest(COALESCE(p.tags, ARRAY[]::text[])) AS t(tag)
  WHERE trim(t.tag) <> ''
)
INSERT INTO tags (name, slug)
SELECT DISTINCT ON (slug) name, slug
FROM expanded
ORDER BY slug, name
ON CONFLICT (slug) DO NOTHING;

WITH expanded AS (
  SELECT
    p.id AS product_id,
    lower(trim(t.tag)) AS slug
  FROM products p
  CROSS JOIN LATERAL unnest(COALESCE(p.tags, ARRAY[]::text[])) AS t(tag)
  WHERE trim(t.tag) <> ''
)
INSERT INTO product_tags (product_id, tag_id)
SELECT e.product_id, tg.id
FROM expanded e
INNER JOIN tags tg ON tg.slug = e.slug
ON CONFLICT DO NOTHING;
