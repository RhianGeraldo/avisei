-- URLs padrão da empresa para integrações Belle e Evogo.
ALTER TABLE public.companies
  ADD COLUMN belle_base_url TEXT,
  ADD COLUMN evogo_url TEXT;
