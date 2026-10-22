-- =====================================================================
-- Controles Individuais por Instância (Liga/Desliga estilo MaturaGo)
-- e Suporte a Diálogos com Números de Fora (Rede de Aquecimento)
-- =====================================================================

-- 1. Chaves seletoras por chip no warmer_numbers
ALTER TABLE public.warmer_numbers 
  ADD COLUMN IF NOT EXISTS enable_dialogs BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_groups BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_status BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_external BOOLEAN NOT NULL DEFAULT true;

-- 2. Suporte a diálogos com números externos
ALTER TABLE public.warmer_dialogs
  ALTER COLUMN responder_number_id DROP NOT NULL;

ALTER TABLE public.warmer_dialogs
  ADD COLUMN IF NOT EXISTS external_phone TEXT,
  ADD COLUMN IF NOT EXISTS is_external BOOLEAN NOT NULL DEFAULT false;

-- 3. Suporte a mensagens recebidas de números externos (inbound)
ALTER TABLE public.warmer_messages
  ALTER COLUMN from_number_id DROP NOT NULL;

ALTER TABLE public.warmer_messages
  ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'outbound';
