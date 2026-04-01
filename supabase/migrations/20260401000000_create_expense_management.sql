/*
  # Expense Management Module

  1. New Tables
    - `expense_categories`
      - Seeded with 5 default categories
      - Super admin can add new categories
    - `expenses`
      - Submitted by staff (all roles except pump_attendant/attendant)
      - Finance approves or rejects
      - Receipt upload optional (uses existing documents bucket)

  2. Enums
    - `expense_status`: draft | submitted | approved | rejected

  3. Security
    - RLS: submitters see own expenses only
    - Finance & Super Admin see all expenses
    - Finance & Super Admin can approve/reject
    - Super Admin can manage categories
*/

-- Expense status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'expense_status') THEN
    CREATE TYPE expense_status AS ENUM ('draft', 'submitted', 'approved', 'rejected');
  END IF;
END $$;

-- Expense categories table (manageable by super_admin)
CREATE TABLE IF NOT EXISTS expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active expense categories"
  ON expense_categories FOR SELECT
  TO authenticated
  USING (is_active = true OR EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
  ));

CREATE POLICY "Super admin can insert expense categories"
  ON expense_categories FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin')
  );

CREATE POLICY "Super admin can update expense categories"
  ON expense_categories FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin')
  );

CREATE POLICY "Super admin can delete expense categories"
  ON expense_categories FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin')
  );

-- Seed default categories
INSERT INTO expense_categories (name, description, sort_order) VALUES
  ('Vehicle / Transport',   'Fuel, vehicle maintenance, travel costs',     1),
  ('Office Supplies',       'Stationery, printing, office consumables',    2),
  ('Maintenance & Repairs', 'Equipment and facility maintenance',           3),
  ('Utilities & Fuel',      'Electricity, water, gas, operational fuel',   4),
  ('Other / General',       'Miscellaneous expenses not listed above',     5)
ON CONFLICT (name) DO NOTHING;

-- Expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_number text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  amount numeric NOT NULL CHECK (amount > 0),
  category_id uuid NOT NULL REFERENCES expense_categories(id),
  receipt_url text,
  expense_date date NOT NULL,
  submitted_by uuid NOT NULL REFERENCES profiles(id),
  status expense_status DEFAULT 'submitted',
  approved_by uuid REFERENCES profiles(id),
  approved_at timestamptz,
  rejection_reason text,
  notes text,
  is_test_data boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Submitters see only their own expenses
CREATE POLICY "Users can view own expenses"
  ON expenses FOR SELECT
  TO authenticated
  USING (
    submitted_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'finance', 'general_manager')
    )
  );

-- Eligible roles can submit expenses
CREATE POLICY "Eligible roles can submit expenses"
  ON expenses FOR INSERT
  TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN (
        'super_admin', 'general_manager', 'finance',
        'administrator', 'operations_supervisor'
      )
    )
  );

-- Submitters can update their own draft/submitted expenses; Finance can update for approval
CREATE POLICY "Submitters can update own draft expenses"
  ON expenses FOR UPDATE
  TO authenticated
  USING (
    (submitted_by = auth.uid() AND status IN ('draft', 'submitted'))
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'finance')
    )
  );

-- Finance and super_admin can delete expenses
CREATE POLICY "Finance and super admin can delete expenses"
  ON expenses FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'finance')
    )
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_expenses_submitted_by   ON expenses(submitted_by);
CREATE INDEX IF NOT EXISTS idx_expenses_status         ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_category_id    ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_expense_date   ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_created_at     ON expenses(created_at);
CREATE INDEX IF NOT EXISTS idx_expense_categories_sort ON expense_categories(sort_order);
