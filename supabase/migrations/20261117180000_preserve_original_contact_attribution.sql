-- Atualiza a função upsert_group_contacts para preservar estritamente
-- o primeiro cadastro do contato (first-touch attribution).
-- Se o número já existir para a empresa, não altera unidade, nome nem anexa novos grupos/colaboradoras.

CREATE OR REPLACE FUNCTION public.upsert_group_contacts(
  p_company_id UUID,
  p_unit_id UUID,
  p_contacts JSONB
)
RETURNS TABLE (
  inserted_count INT,
  updated_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INT := 0;
  v_updated INT := 0;
  v_elem JSONB;
  v_number TEXT;
  v_name TEXT;
  v_new_groups JSONB;
  v_existing_id UUID;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id é obrigatório';
  END IF;

  IF p_contacts IS NULL OR jsonb_array_length(p_contacts) = 0 THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_contacts)
  LOOP
    v_number := trim(v_elem->>'number');
    v_name := NULLIF(trim(v_elem->>'name'), '');
    v_new_groups := COALESCE(v_elem->'groups', '[]'::jsonb);

    IF v_number IS NULL OR v_number = '' THEN
      CONTINUE;
    END IF;

    -- Verifica se já existe na empresa
    SELECT c.id
      INTO v_existing_id
      FROM public.contacts c
     WHERE c.company_id = p_company_id
       AND c.number = v_number
     LIMIT 1;

    IF v_existing_id IS NULL THEN
      -- Inserir novo contato com a unidade e o grupo de origem
      INSERT INTO public.contacts (company_id, unit_id, number, name, groups)
      VALUES (p_company_id, p_unit_id, v_number, v_name, v_new_groups);
      v_inserted := v_inserted + 1;
    ELSE
      -- Já existe: o primeiro cadastro é preservado intacto (não altera unidade, nome nem grupos)
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_inserted, v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_group_contacts(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_group_contacts(UUID, UUID, JSONB) TO service_role;
