-- Webhook por instância (URL para onde a Evolution envia eventos).
ALTER TABLE public.instances ADD COLUMN webhook_url TEXT;
