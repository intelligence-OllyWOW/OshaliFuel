/*
  # Add Missing Columns to Clients Table

  1. Changes
    - Add `po_box` column to clients table for P.O. Box information
    - Add `email` column to clients table for email addresses
    - Add `custom_price_per_liter` column to store client-specific pricing
    
  2. Notes
    - All new columns are nullable to allow for existing records
    - custom_price_per_liter allows clients to have special pricing different from standard rate
*/

-- Add missing columns to clients table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'po_box'
  ) THEN
    ALTER TABLE clients ADD COLUMN po_box text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'email'
  ) THEN
    ALTER TABLE clients ADD COLUMN email text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'custom_price_per_liter'
  ) THEN
    ALTER TABLE clients ADD COLUMN custom_price_per_liter numeric CHECK (custom_price_per_liter IS NULL OR custom_price_per_liter > 0);
  END IF;
END $$;
