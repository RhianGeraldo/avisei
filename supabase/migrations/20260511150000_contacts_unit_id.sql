-- Adiciona a coluna unit_id na tabela contacts se ela ainda não existir
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL;
