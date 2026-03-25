/*
  # Create Storage Bucket for Documents

  1. New Storage Bucket
    - `procurement-documents` bucket for storing purchase order documents
  
  2. Security
    - Authenticated users can upload documents
    - Authenticated users can read documents
    - Only the uploader can update or delete documents
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('procurement-documents', 'procurement-documents', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Authenticated users can upload documents'
  ) THEN
    CREATE POLICY "Authenticated users can upload documents"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'procurement-documents');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Authenticated users can read documents'
  ) THEN
    CREATE POLICY "Authenticated users can read documents"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'procurement-documents');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Users can update own documents'
  ) THEN
    CREATE POLICY "Users can update own documents"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'procurement-documents' AND auth.uid() = owner)
      WITH CHECK (bucket_id = 'procurement-documents' AND auth.uid() = owner);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Users can delete own documents'
  ) THEN
    CREATE POLICY "Users can delete own documents"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'procurement-documents' AND auth.uid() = owner);
  END IF;
END $$;