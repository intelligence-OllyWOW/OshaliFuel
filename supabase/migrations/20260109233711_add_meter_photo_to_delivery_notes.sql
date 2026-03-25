/*
  # Add Meter Photo to Delivery Notes

  1. Changes
    - Add `meter_photo_url` column to delivery_notes table
    - This will store the URL of the meter reading photo taken by attendants

  2. Storage
    - Photos will be stored in the 'documents' storage bucket
    - Path format: delivery-notes/{note_id}/meter-photo.jpg
*/

-- Add meter_photo_url column to delivery_notes table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_notes' AND column_name = 'meter_photo_url'
  ) THEN
    ALTER TABLE delivery_notes ADD COLUMN meter_photo_url text;
  END IF;
END $$;
