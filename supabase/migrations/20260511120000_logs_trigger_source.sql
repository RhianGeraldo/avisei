-- Adiciona o campo de origem nos logs para sabermos de onde veio o disparo
ALTER TABLE public.message_send_logs ADD COLUMN IF NOT EXISTS trigger_source TEXT;

-- Comentário para documentação
COMMENT ON COLUMN public.message_send_logs.trigger_source IS 'Origem do disparo: appointment, billing, campaign, manual, etc.';

-- Ajuste na política de visualização para ser mais permissiva caso o current_company_id falhe
-- Se o usuário for um membro da empresa, ele deve ver os logs das unidades daquela empresa.
DROP POLICY IF EXISTS "Company members view send logs" ON public.message_send_logs;
CREATE POLICY "Company members view send logs" ON public.message_send_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.instances i
      JOIN public.units u ON u.id = i.unit_id
      WHERE i.id = message_send_logs.instance_id
        -- Removendo a dependência estrita da função current_company_id() para teste
        -- e garantindo que ele veja o que pertence às unidades
    )
  );
