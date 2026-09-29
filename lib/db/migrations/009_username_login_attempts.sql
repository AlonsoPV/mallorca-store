CREATE TABLE IF NOT EXISTS username_login_attempts (
  key text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS username_login_attempts_window_idx
  ON username_login_attempts (window_started_at);