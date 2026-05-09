-- Migration to support shared cron jobs across all units

-- 1. Add new columns
ALTER TABLE cron_jobs ADD COLUMN company_id uuid REFERENCES companies(id);
ALTER TABLE cron_jobs ADD COLUMN unit_ids uuid[] DEFAULT '{}';

-- 2. Migrate existing data based on the old unit_id
UPDATE cron_jobs
SET company_id = units.company_id,
    unit_ids = ARRAY[unit_id]
FROM units
WHERE cron_jobs.unit_id = units.id;

-- 3. Make new columns NOT NULL
ALTER TABLE cron_jobs ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE cron_jobs ALTER COLUMN unit_ids SET NOT NULL;

-- 4. Drop old foreign key and column
ALTER TABLE cron_jobs DROP CONSTRAINT IF EXISTS cron_jobs_unit_id_fkey;
ALTER TABLE cron_jobs DROP COLUMN unit_id;
