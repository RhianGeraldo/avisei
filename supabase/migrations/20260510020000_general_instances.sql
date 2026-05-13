-- Tornar unit_id opcional e adicionar company_id para instâncias gerais
ALTER TABLE public.instances ALTER COLUMN unit_id DROP NOT NULL;
ALTER TABLE public.instances ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- Backfill company_id para instâncias existentes
UPDATE public.instances i
SET company_id = u.company_id
FROM public.units u
WHERE i.unit_id = u.id;

-- Para instâncias que possam ter ficado sem company_id (improvável no estado atual)
-- Garantimos que o company_id seja obrigatório
ALTER TABLE public.instances ALTER COLUMN company_id SET NOT NULL;

-- Atualizar RLS para usar company_id
DROP POLICY IF EXISTS "Company members view instances" ON public.instances;
DROP POLICY IF EXISTS "Company admins manage instances" ON public.instances;

CREATE POLICY "Company members view instances" ON public.instances
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

CREATE POLICY "Company admins manage instances" ON public.instances
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'company_admin'))
  WITH CHECK (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'company_admin'));
