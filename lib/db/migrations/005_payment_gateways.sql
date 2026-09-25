-- PayPal + Mercado Pago checkout references (apply with drizzle-kit push or migrate)

ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'MERCADO_PAGO';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'PAYPAL';

ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS provider_checkout_id text;

INSERT INTO payment_method_configs (
  code, name, provider, enabled, sort_order, allow_pickup, allow_delivery,
  configuration_status, customer_label, customer_description
) VALUES (
  'PAYPAL',
  'PayPal',
  'PAYPAL',
  false,
  25,
  true,
  true,
  'not_configured',
  'PayPal',
  'Pago en línea con PayPal. Disponible cuando el comercio lo configure.'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO payment_provider_settings (provider, sandbox)
VALUES ('PAYPAL', true)
ON CONFLICT (provider) DO NOTHING;
