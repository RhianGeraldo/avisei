-- Sistema de Campanhas
CREATE TYPE public.campaign_status AS ENUM ('draft', 'scheduled', 'running', 'paused', 'completed', 'canceled');

CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL, -- Opcional: campanha pode ser de uma unidade ou da empresa toda
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  instance_id UUID REFERENCES public.instances(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status public.campaign_status NOT NULL DEFAULT 'draft',
  interval_seconds INTEGER NOT NULL DEFAULT 30,
  
  -- Estatísticas cacheadas para facilitar UI
  total_contacts INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  
  scheduled_at TIMESTAMPTZ,
  last_processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.campaign_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  name TEXT,
  variables JSONB DEFAULT '{}'::jsonb, -- Ex: {"nome": "João", "p_nome": "João"}
  status public.send_queue_status NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Adicionar campaign_id à fila de envio para rastreamento
ALTER TABLE public.send_queue ADD COLUMN campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL;

-- Índices
CREATE INDEX idx_campaigns_company ON public.campaigns (company_id);
CREATE INDEX idx_campaign_contacts_campaign ON public.campaign_contacts (campaign_id);
CREATE INDEX idx_send_queue_campaign ON public.send_queue (campaign_id);

-- Triggers para updated_at
CREATE TRIGGER trg_campaigns_updated
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_contacts ENABLE ROW LEVEL SECURITY;

-- Policies para Campaigns
CREATE POLICY "Super admins manage all campaigns" ON public.campaigns
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Company members manage own campaigns" ON public.campaigns
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

-- Policies para Campaign Contacts
CREATE POLICY "Super admins manage all campaign contacts" ON public.campaign_contacts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Company members manage own campaign contacts" ON public.campaign_contacts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_contacts.campaign_id
        AND c.company_id = public.current_company_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_contacts.campaign_id
        AND c.company_id = public.current_company_id()
    )
  );

-- Funções para incremento atômico
CREATE OR REPLACE FUNCTION public.increment_campaign_sent(campaign_id_param UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.campaigns
  SET sent_count = sent_count + 1,
      last_processed_at = now()
  WHERE id = campaign_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.increment_campaign_failed(campaign_id_param UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.campaigns
  SET failed_count = failed_count + 1,
      last_processed_at = now()
  WHERE id = campaign_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
