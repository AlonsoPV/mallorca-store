-- Cash on pickup + payment provider catalog (apply with drizzle-kit push or migrate)

ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'CASH_ON_PICKUP';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'confirmed';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'cancelled';

ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_by_user_id text REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS payment_method_configs (
  code text PRIMARY KEY,
  name text NOT NULL,
  provider text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  allow_pickup boolean NOT NULL DEFAULT true,
  allow_delivery boolean NOT NULL DEFAULT false,
  configuration_status text NOT NULL DEFAULT 'not_configured',
  customer_label text NOT NULL,
  customer_description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS branch_payment_methods (
  id serial PRIMARY KEY,
  branch_id integer NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  method_code text NOT NULL REFERENCES payment_method_configs(code) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS branch_payment_methods_unique
  ON branch_payment_methods (branch_id, method_code);

CREATE TABLE IF NOT EXISTS order_payments (
  id serial PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method payment_method NOT NULL,
  provider text NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'MXN',
  status payment_status NOT NULL DEFAULT 'unpaid',
  provider_payment_id text,
  recorded_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

CREATE TABLE IF NOT EXISTS payment_provider_settings (
  provider text PRIMARY KEY,
  sandbox boolean NOT NULL DEFAULT true,
  public_key text,
  access_token_encrypted text,
  webhook_secret_encrypted text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO payment_method_configs (
  code, name, provider, enabled, sort_order, allow_pickup, allow_delivery,
  configuration_status, customer_label, customer_description
) VALUES
  (
    'CASH_ON_PICKUP',
    'Efectivo al recoger',
    'CASH_ON_PICKUP',
    true,
    10,
    true,
    false,
    'configured',
    'Efectivo al recoger',
    'Pagas en sucursal al recoger tu pedido.'
  ),
  (
    'MERCADO_PAGO',
    'Mercado Pago',
    'MERCADO_PAGO',
    false,
    20,
    true,
    true,
    'not_configured',
    'Mercado Pago',
    'Pago en línea. Disponible cuando el comercio lo configure.'
  ),
  (
    'ONLINE',
    'En línea',
    'MERCADO_PAGO',
    false,
    30,
    true,
    true,
    'not_configured',
    'Pago en línea',
    null
  ),
  (
    'TERMINAL',
    'Terminal',
    'TERMINAL',
    true,
    40,
    true,
    false,
    'configured',
    'Terminal en sucursal',
    null
  ),
  (
    'TRANSFER',
    'Transferencia',
    'TRANSFER',
    true,
    50,
    true,
    true,
    'configured',
    'Transferencia',
    null
  )
ON CONFLICT (code) DO NOTHING;

INSERT INTO payment_provider_settings (provider, sandbox)
VALUES ('MERCADO_PAGO', true)
ON CONFLICT (provider) DO NOTHING;
