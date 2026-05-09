-- Templates podem ser compartilhados pela empresa OU específicos de uma unidade.
-- company_id passa a ser obrigatório; unit_id passa a ser opcional (NULL = compartilhado).

ALTER TABLE public.messages
  ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

UPDATE public.messages m
SET company_id = u.company_id
FROM public.units u
WHERE m.unit_id = u.id;

ALTER TABLE public.messages
  ALTER COLUMN unit_id DROP NOT NULL,
  ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_company ON public.messages (company_id);
CREATE INDEX IF NOT EXISTS idx_messages_unit ON public.messages (unit_id);

-- RLS atualizado: usa company_id direto em vez de joinar units.
DROP POLICY IF EXISTS "Super admins manage all messages" ON public.messages;
DROP POLICY IF EXISTS "Company members view messages" ON public.messages;
DROP POLICY IF EXISTS "Company admins manage messages" ON public.messages;

CREATE POLICY "Super admins manage all messages" ON public.messages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Company members view messages" ON public.messages
  FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

CREATE POLICY "Company admins manage messages" ON public.messages
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'company_admin')
    AND company_id = public.current_company_id()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'company_admin')
    AND company_id = public.current_company_id()
  );
