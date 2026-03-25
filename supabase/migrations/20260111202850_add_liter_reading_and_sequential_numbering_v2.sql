/*
  # Add Liter Reading and Sequential Numbering to Delivery Notes

  1. Changes
    - Add `litres_reading` column for manual liter input
    - Rename `registration_number` to `vehicle_registration` for consistency
    - Rename `litres` to `litres_dispensed` for clarity
    - Add `invoice_id` to link delivery note to invoice
    - Add `has_invoice` boolean to track if invoice was created
    - Create sequence for sequential delivery note numbers
    - Add function to auto-generate sequential note numbers

  2. Notes
    - Sequential numbers will be in format: DN-000001, DN-000002, etc.
    - litres_reading is the manual meter liter reading
    - litres_dispensed remains as calculated field (meter B - meter A)
*/

-- Add new columns
ALTER TABLE delivery_notes 
  ADD COLUMN IF NOT EXISTS litres_reading numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES invoices(id),
  ADD COLUMN IF NOT EXISTS has_invoice boolean DEFAULT false;

-- Rename columns for consistency (only if they exist with old names)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'delivery_notes' AND column_name = 'registration_number'
  ) THEN
    ALTER TABLE delivery_notes RENAME COLUMN registration_number TO vehicle_registration;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'delivery_notes' AND column_name = 'litres'
  ) THEN
    ALTER TABLE delivery_notes RENAME COLUMN litres TO litres_dispensed;
  END IF;
END $$;

-- Create sequence for delivery note numbers
CREATE SEQUENCE IF NOT EXISTS delivery_note_number_seq START 1;

-- Create function to generate sequential note numbers
CREATE OR REPLACE FUNCTION generate_delivery_note_number()
RETURNS TEXT AS $$
DECLARE
  next_number INTEGER;
  note_number TEXT;
BEGIN
  next_number := nextval('delivery_note_number_seq');
  note_number := 'DN-' || LPAD(next_number::TEXT, 6, '0');
  RETURN note_number;
END;
$$ LANGUAGE plpgsql;

-- Update existing delivery notes to have sequential numbers if they don't already follow the pattern
DO $$
DECLARE
  note RECORD;
  counter INTEGER := 1;
  max_number INTEGER;
BEGIN
  FOR note IN 
    SELECT id FROM delivery_notes 
    WHERE note_number NOT LIKE 'DN-%'
    OR LENGTH(note_number) != 9
    ORDER BY created_at
  LOOP
    UPDATE delivery_notes 
    SET note_number = 'DN-' || LPAD(counter::TEXT, 6, '0')
    WHERE id = note.id;
    counter := counter + 1;
  END LOOP;
  
  -- Set the sequence to the correct value (at least 1)
  max_number := COALESCE((
    SELECT CAST(SUBSTRING(note_number FROM 4) AS INTEGER) 
    FROM delivery_notes 
    WHERE note_number LIKE 'DN-%'
    ORDER BY created_at DESC 
    LIMIT 1
  ), 0);
  
  IF max_number > 0 THEN
    PERFORM setval('delivery_note_number_seq', max_number);
  END IF;
END $$;
