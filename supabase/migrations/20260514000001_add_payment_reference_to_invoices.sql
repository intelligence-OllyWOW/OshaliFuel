/*
  # Add Payment Reference to Invoices

  1. Changes
    - Add `payment_reference` column to invoices table
      - Nullable text, max 100 characters
      - Indexed for fast lookup when searching by reference across multiple invoices

  2. Business Purpose
    - Allows a single payment reference to be assigned to multiple invoices
      settled in the same bulk payment (e.g. EFT batch number, cheque number).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'payment_reference'
  ) THEN
    ALTER TABLE invoices
      ADD COLUMN payment_reference text CHECK (char_length(payment_reference) <= 100);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoices_payment_reference
  ON invoices (payment_reference)
  WHERE payment_reference IS NOT NULL;
