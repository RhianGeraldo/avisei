-- =====================================================================
-- Módulo de Aquecedor de Números (WhatsApp Number Warmer)
-- Maturação automatizada de chips com conversas privadas 1x1 via IA,
-- anti-looping estrito, simulação de presença humana e grupos compartilhados.
-- =====================================================================

-- 1. Campos de IA e Aquecedor em companies
ALTER TABLE public.companies 
  ADD COLUMN IF NOT EXISTS openai_api_key TEXT,
  ADD COLUMN IF NOT EXISTS warmer_prompt TEXT,
  ADD COLUMN IF NOT EXISTS warmer_settings JSONB DEFAULT '{
    "daily_limit_min": 10,
    "daily_limit_max": 80,
    "start_hour": 8,
    "end_hour": 21,
    "min_delay_seconds": 60,
    "max_delay_seconds": 180,
    "max_turns_per_dialog": 4,
    "enable_groups": true,
    "enable_status": true
  }'::jsonb;

-- 2. Tabela de números dedicados para aquecimento
CREATE TABLE IF NOT EXISTS public.warmer_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone_number TEXT,
  evogo_instance_name TEXT NOT NULL UNIQUE,
  evogo_instance_id TEXT,
  evogo_api_key TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected' 
    CHECK (status IN ('disconnected', 'connecting', 'idle', 'warming', 'paused', 'banned')),
  profile_picture_url TEXT,
  profile_name TEXT,
  current_day INTEGER NOT NULL DEFAULT 1,
  health_score INTEGER NOT NULL DEFAULT 0,
  messages_sent_today INTEGER NOT NULL DEFAULT 0,
  messages_received_today INTEGER NOT NULL DEFAULT 0,
  total_messages_sent INTEGER NOT NULL DEFAULT 0,
  total_messages_received INTEGER NOT NULL DEFAULT 0,
  last_activity_at TIMESTAMPTZ,
  cooldown_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS warmer_numbers_company_idx ON public.warmer_numbers(company_id, status);
CREATE INDEX IF NOT EXISTS warmer_numbers_cooldown_idx ON public.warmer_numbers(status, cooldown_until);

-- 3. Tabela de diálogos 1x1 ativos (Sessões com controle anti-loop)
CREATE TABLE IF NOT EXISTS public.warmer_dialogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  initiator_number_id UUID NOT NULL REFERENCES public.warmer_numbers(id) ON DELETE CASCADE,
  responder_number_id UUID NOT NULL REFERENCES public.warmer_numbers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed')),
  topic TEXT,
  turn_count INTEGER NOT NULL DEFAULT 0,
  max_turns INTEGER NOT NULL DEFAULT 4,
  next_turn_by UUID NOT NULL REFERENCES public.warmer_numbers(id) ON DELETE CASCADE,
  next_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS warmer_dialogs_status_idx ON public.warmer_dialogs(company_id, status, next_message_at);

-- 4. Tabela de grupos compartilhados para aquecimento coletivo
CREATE TABLE IF NOT EXISTS public.warmer_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  group_jid TEXT NOT NULL UNIQUE,
  group_name TEXT NOT NULL,
  invite_link TEXT,
  creator_number_id UUID REFERENCES public.warmer_numbers(id) ON DELETE SET NULL,
  members_count INTEGER NOT NULL DEFAULT 0,
  last_interaction_at TIMESTAMPTZ,
  next_interaction_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS warmer_groups_company_idx ON public.warmer_groups(company_id, next_interaction_at);

-- 5. Tabela de histórico de mensagens trocadas
CREATE TABLE IF NOT EXISTS public.warmer_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  dialog_id UUID REFERENCES public.warmer_dialogs(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.warmer_groups(id) ON DELETE CASCADE,
  from_number_id UUID NOT NULL REFERENCES public.warmer_numbers(id) ON DELETE CASCADE,
  to_number_id UUID REFERENCES public.warmer_numbers(id) ON DELETE CASCADE,
  from_phone TEXT,
  to_phone TEXT,
  to_jid TEXT,
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'sticker', 'audio', 'poll', 'status')),
  turn_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS warmer_messages_company_idx ON public.warmer_messages(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS warmer_messages_dialog_idx ON public.warmer_messages(dialog_id);

-- 6. Habilitar Row Level Security (RLS)
ALTER TABLE public.warmer_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warmer_dialogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warmer_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warmer_messages ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
CREATE POLICY "Super admin pode tudo em warmer_numbers"
ON public.warmer_numbers FOR ALL
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Usuários veem números de aquecimento da própria empresa"
ON public.warmer_numbers FOR ALL
USING (company_id = public.current_company_id())
WITH CHECK (company_id = public.current_company_id());

CREATE POLICY "Super admin pode tudo em warmer_dialogs"
ON public.warmer_dialogs FOR ALL
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Usuários veem diálogos de aquecimento da própria empresa"
ON public.warmer_dialogs FOR ALL
USING (company_id = public.current_company_id())
WITH CHECK (company_id = public.current_company_id());

CREATE POLICY "Super admin pode tudo em warmer_groups"
ON public.warmer_groups FOR ALL
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Usuários veem grupos de aquecimento da própria empresa"
ON public.warmer_groups FOR ALL
USING (company_id = public.current_company_id())
WITH CHECK (company_id = public.current_company_id());

CREATE POLICY "Super admin pode tudo em warmer_messages"
ON public.warmer_messages FOR ALL
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Usuários veem mensagens de aquecimento da própria empresa"
ON public.warmer_messages FOR ALL
USING (company_id = public.current_company_id())
WITH CHECK (company_id = public.current_company_id());
