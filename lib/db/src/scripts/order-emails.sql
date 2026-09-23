CREATE TABLE IF NOT EXISTS order_email_jobs (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  audience text NOT NULL,
  recipient text,
  payload jsonb NOT NULL,
  send_payload jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  first_attempt_at timestamptz,
  sent_at timestamptz,
  provider_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS order_email_jobs_audience_unique ON order_email_jobs(order_id, audience);
CREATE INDEX IF NOT EXISTS order_email_jobs_pending_idx ON order_email_jobs(status, next_attempt_at);

ALTER TABLE order_email_jobs ADD COLUMN IF NOT EXISTS first_attempt_at timestamptz;
