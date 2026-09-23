CREATE TABLE IF NOT EXISTS role_access_policy (
  id integer PRIMARY KEY CHECK (id = 1),
  policy jsonb NOT NULL,
  version integer NOT NULL DEFAULT 0,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS role_access_audit (
  id bigserial PRIMARY KEY,
  actor_id text NOT NULL,
  before_policy jsonb NOT NULL,
  after_policy jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
