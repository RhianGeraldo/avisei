-- Fila de envios persistida. Agendamentos puxados do Belle viram items pendentes;
-- ao enviar, viram 'sent' (e ganham linha em message_send_logs); ao cancelar, 'cancelled'.

CREATE TYPE public.send_queue_status AS ENUM ('pending', 'sent', 'failed', 'cancelled');

CREATE TABLE public.send_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  instance_id UUID REFERENCES public.instances(id) ON DELETE SET NULL,
  number TEXT NOT NULL,
  text TEXT NOT NULL,
  status public.send_queue_status NOT NULL DEFAULT 'pending',
  cod_consulta INTEGER,
  cliente_cod TEXT,
  cliente_nome TEXT,
  scheduled_at TIMESTAMPTZ,
  agendamento_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_send_queue_unit_status ON public.send_queue (unit_id, status, created_at DESC);

CREATE TRIGGER trg_send_queue_updated
  BEFORE UPDATE ON public.send_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.send_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage all queue" ON public.send_queue
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Company members manage own queue" ON public.send_queue
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.units u
      WHERE u.id = send_queue.unit_id
        AND u.company_id = public.current_company_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.units u
      WHERE u.id = send_queue.unit_id
        AND u.company_id = public.current_company_id()
    )
  );
