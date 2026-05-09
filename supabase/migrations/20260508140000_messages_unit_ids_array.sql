-- Templates suportam múltiplas unidades:
--   unit_ids = []           → todas as unidades da empresa
--   unit_ids = [X]          → específica (uma unidade)
--   unit_ids = [X, Y, ...]  → selecionadas (várias)

ALTER TABLE public.messages ADD COLUMN unit_ids UUID[] NOT NULL DEFAULT '{}';

UPDATE public.messages
SET unit_ids = CASE
  WHEN unit_id IS NULL THEN '{}'::UUID[]
  ELSE ARRAY[unit_id]
END;

ALTER TABLE public.messages DROP COLUMN unit_id;

CREATE INDEX IF NOT EXISTS idx_messages_unit_ids ON public.messages USING gin (unit_ids);
