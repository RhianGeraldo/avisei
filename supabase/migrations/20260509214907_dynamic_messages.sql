-- Migration to support dynamic message types (image, media, polls, etc)
ALTER TABLE public.messages
  ADD COLUMN message_type TEXT NOT NULL DEFAULT 'text',
  ADD COLUMN content_data JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.send_queue
  ADD COLUMN message_type TEXT NOT NULL DEFAULT 'text',
  ADD COLUMN content_data JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.message_send_logs
  ADD COLUMN message_type TEXT NOT NULL DEFAULT 'text',
  ADD COLUMN content_data JSONB DEFAULT '{}'::jsonb;
