-- 1. Adicionar o status 'processing' ao enum send_queue_status se não existir
ALTER TYPE public.send_queue_status ADD VALUE IF NOT EXISTS 'processing' AFTER 'paused';

-- 2. Criar função SQL atômica para capturar e travar itens de envio de forma concorrente
CREATE OR REPLACE FUNCTION public.claim_send_queue_items(limit_val int, now_str timestamptz)
RETURNS TABLE (
  id uuid,
  unit_id uuid,
  company_id uuid,
  message_id uuid,
  instance_id uuid,
  number text,
  text text,
  status public.send_queue_status,
  cod_consulta integer,
  cliente_cod text,
  cliente_nome text,
  scheduled_at timestamptz,
  agendamento_data jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  contact_id uuid,
  trigger_source text,
  message_type text,
  content_data jsonb,
  last_error text,
  campaign_id uuid,
  evogo_api_key text
) AS $$
BEGIN
  RETURN QUERY
  WITH locked_items AS (
    SELECT q.id
    FROM public.send_queue q
    WHERE q.status = 'pending'
      AND (q.scheduled_at <= now_str OR q.scheduled_at IS NULL)
    ORDER BY q.scheduled_at ASC
    LIMIT limit_val
    FOR UPDATE SKIP LOCKED
  ), updated_items AS (
    UPDATE public.send_queue q
    SET status = 'processing',
        updated_at = now()
    FROM locked_items l
    WHERE q.id = l.id
    RETURNING q.*
  )
  SELECT 
    u.id,
    u.unit_id,
    u.company_id,
    u.message_id,
    u.instance_id,
    u.number,
    u.text,
    u.status,
    u.cod_consulta,
    u.cliente_cod,
    u.cliente_nome,
    u.scheduled_at,
    u.agendamento_data,
    u.created_at,
    u.updated_at,
    u.contact_id,
    u.trigger_source,
    u.message_type,
    u.content_data,
    u.last_error,
    u.campaign_id,
    inst.evogo_api_key
  FROM updated_items u
  LEFT JOIN public.instances inst ON u.instance_id = inst.id
  ORDER BY u.scheduled_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
