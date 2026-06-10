CREATE TABLE IF NOT EXISTS public.contacts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT,
    number TEXT NOT NULL,
    groups JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, number)
);

-- Habilitar RLS
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- Políticas de segurança
CREATE POLICY "Super admin pode tudo em contacts" 
ON public.contacts
FOR ALL 
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Usuários veem contatos da própria empresa" 
ON public.contacts
FOR SELECT 
USING (company_id = public.current_company_id());

CREATE POLICY "Usuários gerenciam contatos da própria empresa" 
ON public.contacts
FOR ALL 
USING (company_id = public.current_company_id())
WITH CHECK (company_id = public.current_company_id());
