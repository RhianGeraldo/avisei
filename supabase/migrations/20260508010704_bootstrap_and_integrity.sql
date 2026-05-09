-- Bootstrap: primeiro usuário vira super_admin; demais ficam como operator.
-- Garante integridade: instance_id de uma message tem que pertencer à mesma unit.

-- 1) handle_new_user agora também atribui role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  is_first_user BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email);

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first_user;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN is_first_user THEN 'super_admin'::public.app_role ELSE 'operator'::public.app_role END)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 2) Backfill: usuários existentes sem role recebem operator; se ninguém é super_admin, o mais antigo vira super_admin
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'operator'::public.app_role
FROM auth.users u
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
WHERE ur.id IS NULL
ON CONFLICT (user_id, role) DO NOTHING;

DO $$
DECLARE
  oldest_user UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin') THEN
    SELECT id INTO oldest_user FROM auth.users ORDER BY created_at ASC LIMIT 1;
    IF oldest_user IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (oldest_user, 'super_admin'::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  END IF;
END $$;

-- 3) Trigger de integridade em messages: instance_id (se presente) tem que pertencer à mesma unit_id
CREATE OR REPLACE FUNCTION public.messages_validate_instance()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.instance_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.instances i
      WHERE i.id = NEW.instance_id AND i.unit_id = NEW.unit_id
    ) THEN
      RAISE EXCEPTION 'instance_id % does not belong to unit_id %', NEW.instance_id, NEW.unit_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.messages_validate_instance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_messages_validate_instance ON public.messages;
CREATE TRIGGER trg_messages_validate_instance
BEFORE INSERT OR UPDATE OF unit_id, instance_id ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.messages_validate_instance();
