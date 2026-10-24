-- =====================================================================
-- Preservar o histórico de capturas recentes mesmo ao excluir um link
-- Altera link_id para permitir NULL e define ON DELETE SET NULL
-- =====================================================================

ALTER TABLE public.lead_capture_sessions ALTER COLUMN link_id DROP NOT NULL;

ALTER TABLE public.lead_capture_sessions DROP CONSTRAINT IF EXISTS lead_capture_sessions_link_id_fkey;

ALTER TABLE public.lead_capture_sessions
  ADD CONSTRAINT lead_capture_sessions_link_id_fkey
  FOREIGN KEY (link_id) REFERENCES public.lead_capture_links(id) ON DELETE SET NULL;
