CREATE TABLE IF NOT EXISTS mailboxes (
  role text PRIMARY KEY,
  address text NOT NULL DEFAULT '',
  display_name text,
  smtp_user text,
  password_encrypted text,
  smtp_host text NOT NULL DEFAULT 'smtp.hostinger.com',
  smtp_port integer NOT NULL DEFAULT 465,
  smtp_secure boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
