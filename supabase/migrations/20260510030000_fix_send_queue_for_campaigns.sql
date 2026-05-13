-- Permitir unit_id nulo na fila de envio (para instâncias gerais)
ALTER TABLE public.send_queue ALTER COLUMN unit_id DROP NOT NULL;

-- Adicionar company_id à fila de envio para rastreamento e segurança
ALTER TABLE public.send_queue ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- Backfill company_id de itens existentes na fila (baseado na unidade)
UPDATE public.send_queue sq
SET company_id = u.company_id
FROM public.units u
WHERE sq.unit_id = u.id AND sq.company_id IS NULL;

-- Backfill company_id de itens de campanha
UPDATE public.send_queue sq
SET company_id = c.company_id
FROM public.campaigns c
WHERE sq.campaign_id = c.id AND sq.company_id IS NULL;

-- Tornar company_id obrigatório para novos registros
ALTER TABLE public.send_queue ALTER COLUMN company_id SET NOT NULL;

-- Atualizar RLS da send_queue para usar company_id se possível
DROP POLICY IF EXISTS "Company members view send_queue" ON public.send_queue;
CREATE POLICY "Company members view send_queue" ON public.send_queue
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());
