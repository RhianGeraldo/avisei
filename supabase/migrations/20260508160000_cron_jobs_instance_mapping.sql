-- Migration to support instance_mapping JSONB for cron_jobs

ALTER TABLE cron_jobs ADD COLUMN IF NOT EXISTS instance_mapping jsonb DEFAULT '{}'::jsonb;

-- Populate existing instance_mapping based on the current instance_id
-- We map every unit_id inside unit_ids to the existing instance_id
UPDATE cron_jobs
SET instance_mapping = (
  SELECT jsonb_object_agg(u_id, instance_id)
  FROM unnest(unit_ids) AS u_id
)
WHERE instance_id IS NOT NULL AND array_length(unit_ids, 1) > 0;

-- Drop the old instance_id foreign key and column since it's now handled by the mapping
ALTER TABLE cron_jobs DROP CONSTRAINT IF EXISTS cron_jobs_instance_id_fkey;
ALTER TABLE cron_jobs DROP COLUMN IF EXISTS instance_id;
