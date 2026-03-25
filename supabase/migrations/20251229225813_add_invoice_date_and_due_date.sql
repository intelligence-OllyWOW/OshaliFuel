/*
  # Add Invoice Date and Due Date Columns

  1. Changes
    - Add `invoice_date` column to invoices table (date the invoice was issued)
    - Add `due_date` column to invoices table (payment due date)
    - Both columns default to the current date
  
  2. Notes
    - Existing invoices will have their invoice_date set to created_at date
    - Due date defaults to invoice date (can be changed during creation)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'invoice_date'
  ) THEN
    ALTER TABLE invoices ADD COLUMN invoice_date date DEFAULT CURRENT_DATE;
    
    UPDATE invoices SET invoice_date = DATE(created_at) WHERE invoice_date IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'due_date'
  ) THEN
    ALTER TABLE invoices ADD COLUMN due_date date DEFAULT CURRENT_DATE;
    
    UPDATE invoices SET due_date = DATE(created_at) WHERE due_date IS NULL;
  END IF;
END $$;
