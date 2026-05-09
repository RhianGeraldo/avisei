-- Automações configuráveis pelo usuário. Cada cron_job dispara um template
-- num horário fixo, em dias específicos da semana. CF Workers Cron Trigger
-- roda a cada 5 min e processa os jobs cuja janela bateu.

CREATE TABLE public.cron_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  name TEXT,
  schedule_time TEXT NOT NULL,
  -- Dias da semana: 0=Domingo, 1=Segunda, ..., 6=Sábado (convenção JS getDay()).
  days_of_week INT[] NOT NULL DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6],
  status_filter TEXT,
  tipo_filter TEXT,
  auto_dispatch BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT,
  last_run_error TEXT,
  last_run_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cron_jobs_schedule_time_format CHECK (schedule_time ~ '^[0-2][0-9]:[0-5][0-9]$')
);

CREATE INDEX idx_cron_jobs_unit ON public.cron_jobs (unit_id);
CREATE INDEX idx_cron_jobs_active ON public.cron_jobs (active) WHERE active = true;

CREATE TRIGGER trg_cron_jobs_updated
  BEFORE UPDATE ON public.cron_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.cron_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage all crons" ON public.cron_jobs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Company members manage own crons" ON public.cron_jobs
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.units u
      WHERE u.id = cron_jobs.unit_id
        AND u.company_id = public.current_company_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.units u
      WHERE u.id = cron_jobs.unit_id
        AND u.company_id = public.current_company_id()
    )
  );
