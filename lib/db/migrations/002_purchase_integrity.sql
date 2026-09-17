ALTER TABLE inventory_reservations
  ADD COLUMN IF NOT EXISTS consumed_physical boolean NOT NULL DEFAULT true;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_address_snapshot jsonb;
