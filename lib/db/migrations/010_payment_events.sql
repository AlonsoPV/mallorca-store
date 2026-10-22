-- Payment webhook idempotency + audit action for gateway checkout start

ALTER TYPE order_audit_action ADD VALUE IF NOT EXISTS 'PAYMENT_GATEWAY_STARTED';
ALTER TYPE order_audit_action ADD VALUE IF NOT EXISTS 'PAYMENT_WEBHOOK';

CREATE TABLE IF NOT EXISTS payment_events (
  id serial PRIMARY KEY,
  provider text NOT NULL,
  event_key text NOT NULL,
  order_id text REFERENCES orders(id) ON DELETE SET NULL,
  outcome text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_events_provider_event_key
  ON payment_events (provider, event_key);
