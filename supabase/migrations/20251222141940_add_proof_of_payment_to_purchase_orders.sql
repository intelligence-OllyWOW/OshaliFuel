/*
  # Add Proof of Payment to Purchase Orders

  1. Changes
    - Add `proof_of_payment_url` column to `purchase_orders` table to store uploaded payment document URLs
    - Add `payment_date` column to track when payment was made
  
  2. Purpose
    - Enable finance users to upload proof of payment documents when creating/updating purchase orders
    - Store payment documentation for audit and compliance purposes
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'proof_of_payment_url'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN proof_of_payment_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'payment_date'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN payment_date date;
  END IF;
END $$;