/*
  # Add Suppliers Table

  1. New Tables
    - `suppliers`
      - `id` (uuid, primary key)
      - `name` (text, unique, required)
      - `contact` (text, optional)
      - `email` (text, optional)
      - `address` (text, optional)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `is_test_data` (boolean, default false)

  2. Changes
    - Add `supplier_id` to `purchase_orders` table (nullable for backward compatibility)
    - Keep existing `supplier_name` and `supplier_contact` columns for backward compatibility
    - Migrate existing supplier data to the new suppliers table
    - Set supplier_id on existing purchase orders

  3. Security
    - Enable RLS on `suppliers` table
    - Add policies for authenticated users to view suppliers
    - Add policies for finance users to create/update suppliers
*/

CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  contact text,
  email text,
  address text,
  is_test_data boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view suppliers"
  ON suppliers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Finance can create suppliers"
  ON suppliers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('finance', 'super_admin')
    )
  );

CREATE POLICY "Finance can update suppliers"
  ON suppliers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('finance', 'super_admin')
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'supplier_id'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN supplier_id uuid REFERENCES suppliers(id);
  END IF;
END $$;

DO $$
DECLARE
  po_record RECORD;
  existing_supplier_id uuid;
BEGIN
  FOR po_record IN 
    SELECT DISTINCT supplier_name, supplier_contact 
    FROM purchase_orders 
    WHERE supplier_name IS NOT NULL AND supplier_id IS NULL
  LOOP
    SELECT id INTO existing_supplier_id
    FROM suppliers
    WHERE name = po_record.supplier_name;
    
    IF existing_supplier_id IS NULL THEN
      INSERT INTO suppliers (name, contact)
      VALUES (po_record.supplier_name, po_record.supplier_contact)
      RETURNING id INTO existing_supplier_id;
    END IF;
    
    UPDATE purchase_orders
    SET supplier_id = existing_supplier_id
    WHERE supplier_name = po_record.supplier_name AND supplier_id IS NULL;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id ON purchase_orders(supplier_id);
