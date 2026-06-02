/*
  # Add void and amended status to purchase orders

  1. Schema Changes
    - Add 'voided' and 'amended' values to `po_status` enum
    - Add `void_reason` column to `purchase_orders` for recording why a PO was voided
    - Add `amended_from_id` column to track which PO an amendment was created from
    - Add `is_amendment` boolean flag
    - Add `voided_at` timestamp
    - Add `voided_by` user reference

  2. Notes
    - Voiding a PO marks it as cancelled without deleting the record
    - Amending creates a new PO linked to the original
    - Original PO status changes to 'amended' when replaced
*/

-- Add new enum values
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'voided' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'po_status')) THEN
    ALTER TYPE po_status ADD VALUE 'voided';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'amended' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'po_status')) THEN
    ALTER TYPE po_status ADD VALUE 'amended';
  END IF;
END $$;

-- Add void/amend tracking columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'void_reason'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN void_reason text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'voided_at'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN voided_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'voided_by'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN voided_by uuid REFERENCES profiles(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'amended_from_id'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN amended_from_id uuid REFERENCES purchase_orders(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'is_amendment'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN is_amendment boolean DEFAULT false;
  END IF;
END $$;
