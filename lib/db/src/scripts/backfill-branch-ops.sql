-- Branch ops redesign backfill (safe to re-run with IF NOT EXISTS / WHERE NULL).
-- Run after drizzle-kit push applies new columns/tables.

-- Sync status from legacy active flag when status still default/active but inactive
UPDATE branches SET status = 'inactive' WHERE active = false AND status = 'active';
UPDATE branches SET active = true WHERE status = 'active';
UPDATE branches SET active = false WHERE status IN ('inactive', 'archived');

-- Ensure branch codes exist (imports depend on them)
UPDATE branches
SET branch_code = upper(left(regexp_replace(coalesce(short_name, name, slug), '[^a-zA-Z0-9]', '', 'g'), 3))
WHERE branch_code IS NULL OR trim(branch_code) = '';

-- Best-effort street parse from address (keeps address as formatted_address)
UPDATE branches
SET street = address
WHERE street IS NULL OR trim(street) = '';

-- Seed reservation provider from open_table_url
UPDATE branches
SET reservation_provider = 'opentable',
    reservation_url = open_table_url
WHERE open_table_url IS NOT NULL AND trim(open_table_url) <> ''
  AND (reservation_url IS NULL OR trim(reservation_url) = '');

-- Migrate weekly hours JSON → branch_hours (skip if already populated for branch)
INSERT INTO branch_hours (branch_id, weekday, open_time, close_time, closed, slot_order)
SELECT
  b.id,
  CASE lower(coalesce(h->>'day', h->>'label', ''))
    WHEN 'sunday' THEN 0 WHEN 'domingo' THEN 0
    WHEN 'monday' THEN 1 WHEN 'lunes' THEN 1
    WHEN 'tuesday' THEN 2 WHEN 'martes' THEN 2
    WHEN 'wednesday' THEN 3 WHEN 'miércoles' THEN 3 WHEN 'miercoles' THEN 3
    WHEN 'thursday' THEN 4 WHEN 'jueves' THEN 4
    WHEN 'friday' THEN 5 WHEN 'viernes' THEN 5
    WHEN 'saturday' THEN 6 WHEN 'sábado' THEN 6 WHEN 'sabado' THEN 6
    ELSE NULL
  END AS weekday,
  NULLIF(h->>'open', ''),
  NULLIF(h->>'close', ''),
  coalesce((h->>'closed')::boolean, false),
  coalesce((h->>'slotOrder')::int, 0)
FROM branches b
CROSS JOIN LATERAL jsonb_array_elements(coalesce(b.hours, '[]'::jsonb)) AS h
WHERE (h->>'date') IS NULL
  AND NOT EXISTS (SELECT 1 FROM branch_hours bh WHERE bh.branch_id = b.id)
  AND CASE lower(coalesce(h->>'day', h->>'label', ''))
    WHEN 'sunday' THEN 0 WHEN 'domingo' THEN 0
    WHEN 'monday' THEN 1 WHEN 'lunes' THEN 1
    WHEN 'tuesday' THEN 2 WHEN 'martes' THEN 2
    WHEN 'wednesday' THEN 3 WHEN 'miércoles' THEN 3 WHEN 'miercoles' THEN 3
    WHEN 'thursday' THEN 4 WHEN 'jueves' THEN 4
    WHEN 'friday' THEN 5 WHEN 'viernes' THEN 5
    WHEN 'saturday' THEN 6 WHEN 'sábado' THEN 6 WHEN 'sabado' THEN 6
    ELSE NULL
  END IS NOT NULL;

-- Special hours from JSON entries with date
INSERT INTO branch_special_hours (branch_id, date, open_time, close_time, closed, label)
SELECT
  b.id,
  h->>'date',
  NULLIF(h->>'open', ''),
  NULLIF(h->>'close', ''),
  coalesce((h->>'closed')::boolean, false),
  NULLIF(h->>'label', '')
FROM branches b
CROSS JOIN LATERAL jsonb_array_elements(coalesce(b.hours, '[]'::jsonb)) AS h
WHERE (h->>'date') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM branch_special_hours sh
    WHERE sh.branch_id = b.id AND sh.date = h->>'date'
  );

-- Links from legacy columns
INSERT INTO branch_links (branch_id, type, label, url, sort_order, active)
SELECT b.id, 'maps', 'Google Maps', b.maps_url, 0, true
FROM branches b
WHERE b.maps_url IS NOT NULL AND trim(b.maps_url) <> ''
  AND NOT EXISTS (SELECT 1 FROM branch_links l WHERE l.branch_id = b.id AND l.type = 'maps');

INSERT INTO branch_links (branch_id, type, label, url, sort_order, active)
SELECT b.id, 'opentable', 'OpenTable', b.open_table_url, 1, true
FROM branches b
WHERE b.open_table_url IS NOT NULL AND trim(b.open_table_url) <> ''
  AND NOT EXISTS (SELECT 1 FROM branch_links l WHERE l.branch_id = b.id AND l.type = 'opentable');

INSERT INTO branch_links (branch_id, type, label, url, sort_order, active)
SELECT b.id, 'instagram', 'Instagram', b.instagram_url, 2, true
FROM branches b
WHERE b.instagram_url IS NOT NULL AND trim(b.instagram_url) <> ''
  AND NOT EXISTS (SELECT 1 FROM branch_links l WHERE l.branch_id = b.id AND l.type = 'instagram');

INSERT INTO branch_links (branch_id, type, label, url, sort_order, active)
SELECT b.id, 'whatsapp', 'WhatsApp',
  'https://wa.me/' || regexp_replace(b.whatsapp, '[^0-9]', '', 'g'),
  3, true
FROM branches b
WHERE b.whatsapp IS NOT NULL AND trim(b.whatsapp) <> ''
  AND NOT EXISTS (SELECT 1 FROM branch_links l WHERE l.branch_id = b.id AND l.type = 'whatsapp');

-- Images from legacy image_url + gallery
INSERT INTO branch_images (branch_id, url, type, alt, sort_order, active)
SELECT b.id, b.image_url, 'hero', b.name, 0, true
FROM branches b
WHERE b.image_url IS NOT NULL AND trim(b.image_url) <> ''
  AND NOT EXISTS (SELECT 1 FROM branch_images i WHERE i.branch_id = b.id AND i.type = 'hero');

INSERT INTO branch_images (branch_id, url, type, alt, sort_order, active)
SELECT b.id, g.url, 'gallery', b.name, g.ord, true
FROM branches b
CROSS JOIN LATERAL (
  SELECT value AS url, ordinality - 1 AS ord
  FROM jsonb_array_elements_text(coalesce(b.gallery, '[]'::jsonb)) WITH ORDINALITY
) g
WHERE NOT EXISTS (SELECT 1 FROM branch_images i WHERE i.branch_id = b.id AND i.type = 'gallery' AND i.url = g.url);

-- Assignment defaults
UPDATE branch_user_assignments SET role = 'staff' WHERE role IS NULL;
UPDATE branch_user_assignments SET active = true WHERE active IS NULL;
UPDATE branch_user_assignments SET is_primary = false WHERE is_primary IS NULL;
