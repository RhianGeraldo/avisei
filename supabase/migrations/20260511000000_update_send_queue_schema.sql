-- Atualizar o enum de status da fila de envio para incluir 'paused'
ALTER TYPE public.send_queue_status ADD VALUE IF NOT EXISTS 'paused' AFTER 'cancelled';

-- Adicionar colunas necessárias à send_queue que estão sendo usadas no código mas faltavam no banco
ALTER TABLE public.send_queue ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.campaign_contacts(id) ON DELETE SET NULL;
ALTER TABLE public.send_queue ADD COLUMN IF NOT EXISTS trigger_source TEXT DEFAULT 'manual';
ALTER TABLE public.send_queue ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text';
ALTER TABLE public.send_queue ADD COLUMN IF NOT EXISTS content_data JSONB;
ALTER TABLE public.send_queue ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Atualizar RLS para permitir acesso sem unit_id (usando company_id que já foi adicionado em migrações anteriores)
DROP POLICY IF EXISTS "Company members manage own queue" ON public.send_queue;
CREATE POLICY "Company members manage own queue" ON public.send_queue
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());
