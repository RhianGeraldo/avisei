-- Create a bucket for message media
INSERT INTO storage.buckets (id, name, public)
VALUES ('messages', 'messages', true)
ON CONFLICT (id) DO NOTHING;

-- RLS for storage.objects
-- Allow anyone to read (since it's public)
CREATE POLICY "Public Access" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'messages');

-- Allow authenticated users to upload to the 'messages' bucket
CREATE POLICY "Authenticated users can upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'messages');

-- Allow authenticated users to delete their own uploads or all if company admin?
-- For simplicity, let's allow authenticated users to manage the 'messages' bucket.
CREATE POLICY "Authenticated users can manage" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'messages')
  WITH CHECK (bucket_id = 'messages');
