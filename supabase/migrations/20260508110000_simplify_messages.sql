-- Mensagens viram puramente templates: só nome + texto + active.
-- Quem decide instância, dias_offset, horário e tipo de gatilho é o cron_jobs.

ALTER TABLE public.cron_jobs
  ADD COLUMN instance_id UUID REFERENCES public.instances(id) ON DELETE SET NULL,
  ADD COLUMN days_offset INTEGER NOT NULL DEFAULT 0;

-- Backfill: copia o instance_id e days_offset dos templates pros crons que apontam pra eles.
UPDATE public.cron_jobs c
SET instance_id = m.instance_id,
    days_offset = m.days_offset
FROM public.messages m
WHERE c.message_id = m.id;

DROP TRIGGER IF EXISTS trg_messages_validate_instance ON public.messages;
DROP FUNCTION IF EXISTS public.messages_validate_instance();

ALTER TABLE public.messages
  DROP COLUMN IF EXISTS instance_id,
  DROP COLUMN IF EXISTS days_offset,
  DROP COLUMN IF EXISTS send_time,
  DROP COLUMN IF EXISTS trigger_type;
