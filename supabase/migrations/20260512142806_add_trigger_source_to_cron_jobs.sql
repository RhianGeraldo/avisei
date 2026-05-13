-- Adiciona trigger_source às automações para diferenciar entre agendamentos e cobranças.
ALTER TABLE public.cron_jobs ADD COLUMN IF NOT EXISTS trigger_source TEXT DEFAULT 'appointment';

COMMENT ON COLUMN public.cron_jobs.trigger_source IS 'Origem do gatilho: appointment ou billing';
