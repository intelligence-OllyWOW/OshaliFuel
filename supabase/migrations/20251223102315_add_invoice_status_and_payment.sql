/*
  # Add Invoice Status and Payment Method

  1. Changes
    - Add `status` column to invoices (unsettled, settled, void)
    - Add `payment_method` column (card, cash, eft) - only required when settled
    - Add `item_description` column for client-facing invoice description
    - Add `settled_at` timestamp for when invoice was marked as settled
    - Add `settled_by` to track who settled the invoice

  2. Notes
    - Default status is 'unsettled'
    - Payment method is nullable (only set when status is 'settled')
    - FIFO breakdown is kept internally in invoice_items table
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'status'
  ) THEN
    ALTER TABLE invoices ADD COLUMN status text DEFAULT 'unsettled' NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE invoices ADD COLUMN payment_method text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'item_description'
  ) THEN
    ALTER TABLE invoices ADD COLUMN item_description text DEFAULT 'Diesel Fuel';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'settled_at'
  ) THEN
    ALTER TABLE invoices ADD COLUMN settled_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'settled_by'
  ) THEN
    ALTER TABLE invoices ADD COLUMN settled_by uuid REFERENCES profiles(id);
  END IF;
END $$;

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check 
  CHECK (status IN ('unsettled', 'settled', 'void'));

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_payment_method_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_payment_method_check 
  CHECK (payment_method IS NULL OR payment_method IN ('card', 'cash', 'eft'));

CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id);