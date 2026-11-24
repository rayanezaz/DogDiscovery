-- Run in Supabase SQL Editor after creating the project.

INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('dog-photos','dog-photos',true,5242880,ARRAY['image/webp'])
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Dog Discovery upload own photos') THEN
    CREATE POLICY "Dog Discovery upload own photos" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id='dog-photos' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Dog Discovery read own photo metadata') THEN
    CREATE POLICY "Dog Discovery read own photo metadata" ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id='dog-photos' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);
  END IF;
END $$;
-- No UPDATE or DELETE policy: existing photo URLs remain immutable.
