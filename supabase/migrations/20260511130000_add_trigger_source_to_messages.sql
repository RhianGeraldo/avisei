-- Adiciona o campo de origem nos templates de mensagens
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS trigger_source TEXT DEFAULT 'appointment';

-- Comentário para documentação
COMMENT ON COLUMN public.messages.trigger_source IS 'Origem do template: appointment (agendamento) ou billing (cobrança)';

-- Atualiza as colunas message_type e content_data se não existirem (garantindo sincronia)
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS content_data JSONB DEFAULT '{}'::jsonb;
