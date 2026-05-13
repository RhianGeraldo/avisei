-- Adiciona suporte a mídias no histórico de envios
ALTER TABLE public.message_send_logs ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text';
ALTER TABLE public.message_send_logs ADD COLUMN IF NOT EXISTS content_data JSONB;
