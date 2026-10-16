-- =====================================================================
-- Captura de Leads via Link Público
-- Uma pessoa acessa /conectar/[token], informa o nome, escaneia o QR Code
-- e o sistema extrai automaticamente todos os grupos + participantes do
-- WhatsApp dela, transformando-os em leads (tabela contacts).
-- =====================================================================

-- 1. Links de captura (criados pelos usuários da empresa)
CREATE TABLE IF NOT EXISTS public.lead_capture_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_capture_links_company_idx ON public.lead_capture_links(company_id);

-- 2. Sessões de captura (cada pessoa que conectou pelo link)
CREATE TABLE IF NOT EXISTS public.lead_capture_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID NOT NULL REFERENCES public.lead_capture_links(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
  person_name TEXT NOT NULL,
  instance_id UUID REFERENCES public.instances(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_connection'
    CHECK (status IN ('awaiting_connection', 'extracting', 'completed', 'failed', 'expired')),
  groups_total INTEGER NOT NULL DEFAULT 0,
  groups_done INTEGER NOT NULL DEFAULT 0,
  groups_failed INTEGER NOT NULL DEFAULT 0,
  participants_processed INTEGER NOT NULL DEFAULT 0,
  skipped_without_phone INTEGER NOT NULL DEFAULT 0,
  leads_inserted INTEGER NOT NULL DEFAULT 0,
  leads_updated INTEGER NOT NULL DEFAULT 0,
  processed_group_jids JSONB NOT NULL DEFAULT '[]'::jsonb,
  error TEXT,
  heartbeat_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_capture_sessions_link_status_idx ON public.lead_capture_sessions(link_id, status);
CREATE INDEX IF NOT EXISTS lead_capture_sessions_company_idx ON public.lead_capture_sessions(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lead_capture_sessions_status_idx ON public.lead_capture_sessions(status, heartbeat_at);

-- 3. RLS
ALTER TABLE public.lead_capture_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_capture_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin pode tudo em lead_capture_links"
ON public.lead_capture_links FOR ALL
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Usuários veem links da própria empresa"
ON public.lead_capture_links FOR SELECT
USING (company_id = public.current_company_id());

CREATE POLICY "Usuários gerenciam links da própria empresa"
ON public.lead_capture_links FOR ALL
USING (company_id = public.current_company_id())
WITH CHECK (
  company_id = public.current_company_id()
  AND (
    unit_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.units u
      WHERE u.id = lead_capture_links.unit_id
        AND u.company_id = lead_capture_links.company_id
    )
  )
);

-- Sessões são escritas apenas pelo servidor (service role). Usuários só leem.
CREATE POLICY "Super admin pode tudo em lead_capture_sessions"
ON public.lead_capture_sessions FOR ALL
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Usuários veem sessões da própria empresa"
ON public.lead_capture_sessions FOR SELECT
USING (company_id = public.current_company_id());

-- 4. Upsert em lote de contatos vindos de grupos
-- Recebe [{ "number": "5511...", "name": "...", "groups": [{ "jid": "...", ... }] }]
-- - Insere contatos novos
-- - Em contatos existentes: acrescenta somente grupos ainda não registrados (por jid),
--   preenche unit_id/name se estiverem vazios
-- Retorna quantos foram inseridos e quantos foram efetivamente alterados.
CREATE OR REPLACE FUNCTION public.upsert_group_contacts(
  p_company_id UUID,
  p_unit_id UUID,
  p_contacts JSONB
)
RETURNS TABLE (inserted INTEGER, updated INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INTEGER := 0;
  v_updated INTEGER := 0;
  elem JSONB;
  v_number TEXT;
  v_name TEXT;
  v_new_groups JSONB;
  v_existing_id UUID;
  v_existing_groups JSONB;
  v_existing_unit_id UUID;
  v_existing_name TEXT;
  v_merged_groups JSONB;
  v_group_elem JSONB;
  v_jid TEXT;
BEGIN
  FOR elem IN SELECT * FROM jsonb_array_elements(p_contacts)
  LOOP
    v_number := elem->>'number';
    IF v_number IS NULL OR trim(v_number) = '' THEN
      CONTINUE;
    END IF;

    v_name := NULLIF(trim(elem->>'name'), '');
    IF jsonb_typeof(elem->'groups') = 'array' THEN
      v_new_groups := elem->'groups';
    ELSE
      v_new_groups := '[]'::jsonb;
    END IF;

    -- Busca se já existe contato para a empresa e número
    SELECT c.id, c.groups, c.unit_id, c.name
      INTO v_existing_id, v_existing_groups, v_existing_unit_id, v_existing_name
      FROM public.contacts c
     WHERE c.company_id = p_company_id
       AND c.number = v_number
     LIMIT 1;

    IF v_existing_id IS NULL THEN
      -- Inserir novo contato
      INSERT INTO public.contacts (company_id, unit_id, number, name, groups)
      VALUES (p_company_id, p_unit_id, v_number, v_name, v_new_groups);
      v_inserted := v_inserted + 1;
    ELSE
      -- Já existe: funde os grupos sem duplicar por jid
      v_merged_groups := COALESCE(v_existing_groups, '[]'::jsonb);

      FOR v_group_elem IN SELECT * FROM jsonb_array_elements(v_new_groups)
      LOOP
        v_jid := v_group_elem->>'jid';
        IF v_jid IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(v_merged_groups) g WHERE g->>'jid' = v_jid
        ) THEN
          v_merged_groups := v_merged_groups || jsonb_build_array(v_group_elem);
        END IF;
      END LOOP;

      UPDATE public.contacts
         SET groups = v_merged_groups,
             unit_id = COALESCE(v_existing_unit_id, p_unit_id),
             name = COALESCE(v_existing_name, v_name),
             updated_at = now()
       WHERE id = v_existing_id;

      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_inserted, v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_group_contacts(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_group_contacts(UUID, UUID, JSONB) TO service_role;
