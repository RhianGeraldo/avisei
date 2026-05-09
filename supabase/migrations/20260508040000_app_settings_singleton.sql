-- Substitui as URLs por empresa (revertidas) por uma configuração global única.

ALTER TABLE public.companies
  DROP COLUMN IF EXISTS belle_base_url,
  DROP COLUMN IF EXISTS evogo_url;

-- Tabela singleton: único registro garantido por PK booleana fixa.
CREATE TABLE public.app_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
  belle_base_url TEXT,
  evogo_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.app_settings (id) VALUES (TRUE) ON CONFLICT DO NOTHING;

CREATE TRIGGER trg_app_settings_updated
BEFORE UPDATE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode ler (URLs não são segredo).
CREATE POLICY "Authenticated read app settings" ON public.app_settings
  FOR SELECT TO authenticated
  USING (true);

-- Apenas super_admin altera.
CREATE POLICY "Super admins update app settings" ON public.app_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
