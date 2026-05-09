-- Histórico de envios de mensagens via Evogo.
-- Inserido pelo server function sendEvogoText após cada tentativa (sucesso ou erro).

CREATE TABLE public.message_send_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES public.instances(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  number TEXT NOT NULL,
  text TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  error TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_message_send_logs_instance ON public.message_send_logs (instance_id, sent_at DESC);

ALTER TABLE public.message_send_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage all send logs" ON public.message_send_logs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Company members view send logs" ON public.message_send_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.instances i
      JOIN public.units u ON u.id = i.unit_id
      WHERE i.id = message_send_logs.instance_id
        AND u.company_id = public.current_company_id()
    )
  );

CREATE POLICY "Company members insert send logs" ON public.message_send_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.instances i
      JOIN public.units u ON u.id = i.unit_id
      WHERE i.id = message_send_logs.instance_id
        AND u.company_id = public.current_company_id()
    )
  );
