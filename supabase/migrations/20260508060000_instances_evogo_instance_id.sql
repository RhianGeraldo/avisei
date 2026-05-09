-- UUID interno da instância na Evolution API.
-- Usado nos paths /instance/connect/<id>, /delete/<id>, /logout/<id>, etc — versões
-- recentes da Evolution rejeitam o nome no path.
ALTER TABLE public.instances ADD COLUMN evogo_instance_id TEXT;
