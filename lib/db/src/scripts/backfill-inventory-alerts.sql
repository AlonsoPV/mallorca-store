-- Backfill inventory alert workflow fields after schema push.
-- Safe to re-run.

UPDATE inventory_alerts
SET status = CASE
  WHEN resolved_at IS NULL THEN 'OPEN'::inventory_alert_status
  ELSE 'RESOLVED'::inventory_alert_status
END
WHERE status IS NULL
   OR (resolved_at IS NULL AND status = 'RESOLVED')
   OR (resolved_at IS NOT NULL AND status = 'OPEN');

UPDATE inventory_alerts
SET source = 'AUTOMATIC'::inventory_alert_source
WHERE source IS NULL;

UPDATE inventory_alerts
SET priority = CASE
  WHEN type::text IN ('OUT_OF_STOCK', 'CRITICAL_STOCK') THEN 'CRITICAL'::inventory_alert_priority
  WHEN type::text = 'LOW_STOCK' THEN 'HIGH'::inventory_alert_priority
  ELSE COALESCE(priority, 'MEDIUM'::inventory_alert_priority)
END
WHERE priority IS NULL;
