-- =====================================================================
-- Ajuste da Régua de Maturação do Aquecedor de Números
-- 1. current_day passa a ter DEFAULT 0 (começa zerado)
-- =====================================================================

ALTER TABLE public.warmer_numbers ALTER COLUMN current_day SET DEFAULT 0;
