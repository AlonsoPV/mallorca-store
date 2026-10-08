CREATE TABLE IF NOT EXISTS store_menus (
  menu_key text PRIMARY KEY,
  scope text NOT NULL,
  branch_id integer REFERENCES branches(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  content_type text NOT NULL DEFAULT 'application/pdf',
  file_data bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_menus_scope_check CHECK (
    (scope = 'global' AND branch_id IS NULL AND menu_key = 'global')
    OR (scope = 'branch' AND branch_id IS NOT NULL AND menu_key = 'branch-' || branch_id::text)
  )
);
