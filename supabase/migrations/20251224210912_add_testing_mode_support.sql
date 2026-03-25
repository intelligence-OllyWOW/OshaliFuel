/*
  # Add Testing Mode Support

  This migration adds testing mode functionality to the system.

  1. Changes to Tables
    - Adds `is_test_data` boolean column (default false) to:
      - purchase_requisitions
      - purchase_orders
      - goods_received
      - inventory_items
      - invoices
      - invoice_line_items
      - clients
      - client_vehicles
      - notifications
    - Adds `testing_mode_enabled` boolean column to system_settings

  2. Security
    - All existing RLS policies remain in effect
    - Test data follows same access rules as regular data

  3. Notes
    - When testing mode is enabled, all new records are marked with is_test_data = true
    - When testing mode is disabled, all test data can be purged
*/

-- Add is_test_data column to purchase_requisitions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_requisitions' AND column_name = 'is_test_data'
  ) THEN
    ALTER TABLE purchase_requisitions ADD COLUMN is_test_data boolean DEFAULT false;
  END IF;
END $$;

-- Add is_test_data column to purchase_orders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'is_test_data'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN is_test_data boolean DEFAULT false;
  END IF;
END $$;

-- Add is_test_data column to goods_received
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'goods_received' AND column_name = 'is_test_data'
  ) THEN
    ALTER TABLE goods_received ADD COLUMN is_test_data boolean DEFAULT false;
  END IF;
END $$;

-- Add is_test_data column to inventory_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_items' AND column_name = 'is_test_data'
  ) THEN
    ALTER TABLE inventory_items ADD COLUMN is_test_data boolean DEFAULT false;
  END IF;
END $$;

-- Add is_test_data column to invoices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'is_test_data'
  ) THEN
    ALTER TABLE invoices ADD COLUMN is_test_data boolean DEFAULT false;
  END IF;
END $$;

-- Add is_test_data column to invoice_line_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_line_items' AND column_name = 'is_test_data'
  ) THEN
    ALTER TABLE invoice_line_items ADD COLUMN is_test_data boolean DEFAULT false;
  END IF;
END $$;

-- Add is_test_data column to clients
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'is_test_data'
  ) THEN
    ALTER TABLE clients ADD COLUMN is_test_data boolean DEFAULT false;
  END IF;
END $$;

-- Add is_test_data column to client_vehicles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_vehicles' AND column_name = 'is_test_data'
  ) THEN
    ALTER TABLE client_vehicles ADD COLUMN is_test_data boolean DEFAULT false;
  END IF;
END $$;

-- Add is_test_data column to notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'is_test_data'
  ) THEN
    ALTER TABLE notifications ADD COLUMN is_test_data boolean DEFAULT false;
  END IF;
END $$;

-- Add testing_mode_enabled column to system_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'system_settings' AND column_name = 'testing_mode_enabled'
  ) THEN
    ALTER TABLE system_settings ADD COLUMN testing_mode_enabled boolean DEFAULT false;
  END IF;
END $$;

-- Create indexes for efficient test data queries
CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_test_data ON purchase_requisitions (is_test_data) WHERE is_test_data = true;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_test_data ON purchase_orders (is_test_data) WHERE is_test_data = true;
CREATE INDEX IF NOT EXISTS idx_goods_received_test_data ON goods_received (is_test_data) WHERE is_test_data = true;
CREATE INDEX IF NOT EXISTS idx_inventory_items_test_data ON inventory_items (is_test_data) WHERE is_test_data = true;
CREATE INDEX IF NOT EXISTS idx_invoices_test_data ON invoices (is_test_data) WHERE is_test_data = true;
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_test_data ON invoice_line_items (is_test_data) WHERE is_test_data = true;
CREATE INDEX IF NOT EXISTS idx_clients_test_data ON clients (is_test_data) WHERE is_test_data = true;
CREATE INDEX IF NOT EXISTS idx_client_vehicles_test_data ON client_vehicles (is_test_data) WHERE is_test_data = true;
CREATE INDEX IF NOT EXISTS idx_notifications_test_data ON notifications (is_test_data) WHERE is_test_data = true;