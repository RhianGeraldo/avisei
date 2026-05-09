-- Volta o instance_id na tabela messages: cada template indica qual instância usa por padrão.
-- A automação (cron_jobs.instance_id) e o botão Enviar agora podem sobrescrever.
ALTER TABLE public.messages
  ADD COLUMN instance_id UUID REFERENCES public.instances(id) ON DELETE SET NULL;
