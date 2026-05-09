-- admin_token global da Evogo para CRUD de instâncias.
-- evogo_url por instância é descartado (sempre usa o global).
-- Restringe leitura de app_settings ao super_admin (admin_token é segredo).

ALTER TABLE public.app_settings ADD COLUMN evogo_admin_token TEXT;

ALTER TABLE public.instances DROP COLUMN IF EXISTS evogo_url;

DROP POLICY IF EXISTS "Authenticated read app settings" ON public.app_settings;

CREATE POLICY "Super admins read app settings" ON public.app_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
