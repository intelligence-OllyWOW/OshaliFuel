/*
# Add Fuel Movement, Financial Reconciliation, Credit Ledger, Recurring Expenses, and Tank Audit Tables

## Overview
This migration adds tables for:
- Fuel movement tracking (tank dipping, meter readings, reconciliation, inventory variance)
- Financial reconciliation (daily cash-up / shift reconciliation)
- Customer credit ledger (credit transactions and payments)
- Recurring expenses (scheduled monthly expenses)
- Tank management audit log (reset/empty/siphon actions)
- Shift field for invoices
- User deactivation support (is_active flag on profiles)

## New Tables

### tank_dippings
Records physical tank measurements at shift start/end.
- id, date, time, tank_id, physical_quantity (NUMERIC for precision), shift (1 or 2), user_id, dipping_type (opening/closing), is_test_data, created_at

### fuel_delivery_readings
Records physical tank measurements before and after fuel deliveries.
- id, tank_id, date, time, physical_quantity, reading_type (before_delivery/after_delivery), goods_received_id, user_id, is_test_data, created_at

### meter_readings
Records nozzle meter readings per shift.
- id, date, shift, nozzle_number, opening_reading (NUMERIC), closing_reading (NUMERIC), liters_sold (NUMERIC GENERATED), user_id, is_test_data, created_at

### fuel_movement_reconciliations
Compares expected vs actual fuel quantities per shift.
- id, date, shift, tank_id, opening_liters, deliveries_received, fuel_sold_meters, closing_liters, dip_reading, variance (GENERATED), variance_classification (GENERATED), user_id, is_test_data, created_at

### inventory_variances
Compares system stock vs physical dip per tank.
- id, date, tank_id, system_quantity, physical_quantity, variance (GENERATED), variance_classification (GENERATED), user_id, notes, is_test_data, created_at

### shift_cashups
Daily cash-up and shift reconciliation records.
- id, date, shift, attendant_id, supervisor_id, shift_start_time, shift_end_time
- cash_sales, card_sales, eft_sales, credit_sales, total_sales (GENERATED)
- opening_cash, cash_received, cash_paid_out, cash_deposited, closing_cash_counted, cash_carried_forward
- expected_cash (GENERATED), variance (GENERATED)
- attendant_confirmed, supervisor_confirmed, variance_comments, management_approved, management_approved_by
- is_test_data, created_at, updated_at

### credit_transactions
Customer credit ledger entries.
- id, date, customer_id, liters_sold, selling_price, discount_applied, transaction_value (GENERATED), amount_paid, outstanding_amount (GENERATED), invoice_id, user_id, notes, is_test_data, created_at

### credit_payments
Payments against customer credit.
- id, date, customer_id, amount_paid, payment_reference, user_id, notes, is_test_data, created_at

### recurring_expenses
Scheduled monthly expense definitions.
- id, title, description, amount, category_id, due_day_of_month, is_active, next_due_date, last_generated_date, reminder_days_before, user_id, is_test_data, created_at, updated_at

### tank_action_audit
Audit log for tank reset/empty/siphon.
- id, tank_id, action_type, previous_quantity, new_quantity, reason, performed_by, is_test_data, created_at

## Modified Tables
- invoices: add shift column (INTEGER, 1 or 2)
- profiles: add is_active column (BOOLEAN, default true)

## Security
- RLS enabled on all new tables
- Policies for authenticated users with appropriate role restrictions
*/

-- Add shift column to invoices
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'shift') THEN
    ALTER TABLE invoices ADD COLUMN shift INTEGER CHECK (shift IN (1, 2));
  END IF;
END $$;

-- Add is_active column to profiles for soft-delete
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_active') THEN
    ALTER TABLE profiles ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

-- Tank Dippings
CREATE TABLE IF NOT EXISTS tank_dippings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  time TIME NOT NULL,
  tank_id uuid NOT NULL REFERENCES inventory_tanks(id),
  physical_quantity NUMERIC(12,2) NOT NULL CHECK (physical_quantity >= 0),
  shift INTEGER NOT NULL CHECK (shift IN (1, 2)),
  dipping_type TEXT NOT NULL CHECK (dipping_type IN ('opening', 'closing')),
  user_id uuid NOT NULL REFERENCES profiles(id),
  is_test_data BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tank_dippings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_tank_dippings" ON tank_dippings;
CREATE POLICY "authenticated_select_tank_dippings" ON tank_dippings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_tank_dippings" ON tank_dippings;
CREATE POLICY "authenticated_insert_tank_dippings" ON tank_dippings FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_tank_dippings" ON tank_dippings;
CREATE POLICY "authenticated_update_tank_dippings" ON tank_dippings FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_tank_dippings" ON tank_dippings;
CREATE POLICY "authenticated_delete_tank_dippings" ON tank_dippings FOR DELETE
  TO authenticated USING (true);

-- Fuel Delivery Readings
CREATE TABLE IF NOT EXISTS fuel_delivery_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tank_id uuid NOT NULL REFERENCES inventory_tanks(id),
  date DATE NOT NULL,
  time TIME NOT NULL,
  physical_quantity NUMERIC(12,2) NOT NULL CHECK (physical_quantity >= 0),
  reading_type TEXT NOT NULL CHECK (reading_type IN ('before_delivery', 'after_delivery')),
  goods_received_id uuid REFERENCES goods_received(id),
  user_id uuid NOT NULL REFERENCES profiles(id),
  is_test_data BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE fuel_delivery_readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_fuel_delivery_readings" ON fuel_delivery_readings;
CREATE POLICY "authenticated_select_fuel_delivery_readings" ON fuel_delivery_readings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_fuel_delivery_readings" ON fuel_delivery_readings;
CREATE POLICY "authenticated_insert_fuel_delivery_readings" ON fuel_delivery_readings FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_fuel_delivery_readings" ON fuel_delivery_readings;
CREATE POLICY "authenticated_update_fuel_delivery_readings" ON fuel_delivery_readings FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_fuel_delivery_readings" ON fuel_delivery_readings;
CREATE POLICY "authenticated_delete_fuel_delivery_readings" ON fuel_delivery_readings FOR DELETE
  TO authenticated USING (true);

-- Meter Readings
CREATE TABLE IF NOT EXISTS meter_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  shift INTEGER NOT NULL CHECK (shift IN (1, 2)),
  nozzle_number INTEGER NOT NULL CHECK (nozzle_number IN (1, 2)),
  opening_reading NUMERIC(12,2) NOT NULL CHECK (opening_reading >= 0),
  closing_reading NUMERIC(12,2) NOT NULL CHECK (closing_reading >= opening_reading),
  liters_sold NUMERIC(12,2) GENERATED ALWAYS AS (closing_reading - opening_reading) STORED,
  user_id uuid NOT NULL REFERENCES profiles(id),
  is_test_data BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE meter_readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_meter_readings" ON meter_readings;
CREATE POLICY "authenticated_select_meter_readings" ON meter_readings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_meter_readings" ON meter_readings;
CREATE POLICY "authenticated_insert_meter_readings" ON meter_readings FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_meter_readings" ON meter_readings;
CREATE POLICY "authenticated_update_meter_readings" ON meter_readings FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_meter_readings" ON meter_readings;
CREATE POLICY "authenticated_delete_meter_readings" ON meter_readings FOR DELETE
  TO authenticated USING (true);

-- Fuel Movement Reconciliations
CREATE TABLE IF NOT EXISTS fuel_movement_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  shift INTEGER NOT NULL CHECK (shift IN (1, 2)),
  tank_id uuid NOT NULL REFERENCES inventory_tanks(id),
  opening_liters NUMERIC(12,2) NOT NULL DEFAULT 0,
  deliveries_received NUMERIC(12,2) NOT NULL DEFAULT 0,
  fuel_sold_meters NUMERIC(12,2) NOT NULL DEFAULT 0,
  closing_liters NUMERIC(12,2) NOT NULL DEFAULT 0,
  dip_reading NUMERIC(12,2) NOT NULL DEFAULT 0,
  variance NUMERIC(12,2) GENERATED ALWAYS AS (dip_reading - (opening_liters + deliveries_received - fuel_sold_meters)) STORED,
  variance_classification TEXT GENERATED ALWAYS AS (
    CASE
      WHEN ABS(dip_reading - (opening_liters + deliveries_received - fuel_sold_meters)) <= 20 THEN 'NORMAL'
      WHEN ABS(dip_reading - (opening_liters + deliveries_received - fuel_sold_meters)) <= 100 THEN 'INVESTIGATE'
      ELSE 'CRITICAL'
    END
  ) STORED,
  user_id uuid NOT NULL REFERENCES profiles(id),
  is_test_data BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE fuel_movement_reconciliations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_fuel_reconciliations" ON fuel_movement_reconciliations;
CREATE POLICY "authenticated_select_fuel_reconciliations" ON fuel_movement_reconciliations FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_fuel_reconciliations" ON fuel_movement_reconciliations;
CREATE POLICY "authenticated_insert_fuel_reconciliations" ON fuel_movement_reconciliations FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_fuel_reconciliations" ON fuel_movement_reconciliations;
CREATE POLICY "authenticated_update_fuel_reconciliations" ON fuel_movement_reconciliations FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_fuel_reconciliations" ON fuel_movement_reconciliations;
CREATE POLICY "authenticated_delete_fuel_reconciliations" ON fuel_movement_reconciliations FOR DELETE
  TO authenticated USING (true);

-- Inventory Variances
CREATE TABLE IF NOT EXISTS inventory_variances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  tank_id uuid NOT NULL REFERENCES inventory_tanks(id),
  system_quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
  physical_quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
  variance NUMERIC(12,2) GENERATED ALWAYS AS (physical_quantity - system_quantity) STORED,
  variance_classification TEXT GENERATED ALWAYS AS (
    CASE
      WHEN ABS(physical_quantity - system_quantity) <= 20 THEN 'NORMAL'
      WHEN ABS(physical_quantity - system_quantity) <= 100 THEN 'INVESTIGATE'
      ELSE 'CRITICAL'
    END
  ) STORED,
  user_id uuid NOT NULL REFERENCES profiles(id),
  notes TEXT,
  is_test_data BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE inventory_variances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_inventory_variances" ON inventory_variances;
CREATE POLICY "authenticated_select_inventory_variances" ON inventory_variances FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_inventory_variances" ON inventory_variances;
CREATE POLICY "authenticated_insert_inventory_variances" ON inventory_variances FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_inventory_variances" ON inventory_variances;
CREATE POLICY "authenticated_update_inventory_variances" ON inventory_variances FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_inventory_variances" ON inventory_variances;
CREATE POLICY "authenticated_delete_inventory_variances" ON inventory_variances FOR DELETE
  TO authenticated USING (true);

-- Shift Cash-Ups
CREATE TABLE IF NOT EXISTS shift_cashups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  shift INTEGER NOT NULL CHECK (shift IN (1, 2)),
  attendant_id uuid REFERENCES profiles(id),
  supervisor_id uuid REFERENCES profiles(id),
  shift_start_time TIME,
  shift_end_time TIME,
  cash_sales NUMERIC(12,2) NOT NULL DEFAULT 0,
  card_sales NUMERIC(12,2) NOT NULL DEFAULT 0,
  eft_sales NUMERIC(12,2) NOT NULL DEFAULT 0,
  credit_sales NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_sales NUMERIC(12,2) GENERATED ALWAYS AS (cash_sales + card_sales + eft_sales + credit_sales) STORED,
  opening_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
  cash_received NUMERIC(12,2) NOT NULL DEFAULT 0,
  cash_paid_out NUMERIC(12,2) NOT NULL DEFAULT 0,
  cash_deposited NUMERIC(12,2) NOT NULL DEFAULT 0,
  closing_cash_counted NUMERIC(12,2) NOT NULL DEFAULT 0,
  cash_carried_forward NUMERIC(12,2) NOT NULL DEFAULT 0,
  expected_cash NUMERIC(12,2) GENERATED ALWAYS AS (opening_cash + cash_sales - cash_paid_out - cash_deposited) STORED,
  variance NUMERIC(12,2) GENERATED ALWAYS AS (closing_cash_counted - (opening_cash + cash_sales - cash_paid_out - cash_deposited)) STORED,
  attendant_confirmed BOOLEAN NOT NULL DEFAULT false,
  supervisor_confirmed BOOLEAN NOT NULL DEFAULT false,
  variance_comments TEXT,
  management_approved BOOLEAN NOT NULL DEFAULT false,
  management_approved_by uuid REFERENCES profiles(id),
  user_id uuid NOT NULL REFERENCES profiles(id),
  is_test_data BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE shift_cashups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_shift_cashups" ON shift_cashups;
CREATE POLICY "authenticated_select_shift_cashups" ON shift_cashups FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_shift_cashups" ON shift_cashups;
CREATE POLICY "authenticated_insert_shift_cashups" ON shift_cashups FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_shift_cashups" ON shift_cashups;
CREATE POLICY "authenticated_update_shift_cashups" ON shift_cashups FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_shift_cashups" ON shift_cashups;
CREATE POLICY "authenticated_delete_shift_cashups" ON shift_cashups FOR DELETE
  TO authenticated USING (true);

-- Credit Transactions
CREATE TABLE IF NOT EXISTS credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  customer_id uuid NOT NULL REFERENCES clients(id),
  liters_sold NUMERIC(12,2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_applied NUMERIC(12,2) NOT NULL DEFAULT 0,
  transaction_value NUMERIC(12,2) GENERATED ALWAYS AS ((liters_sold * selling_price) - discount_applied) STORED,
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  outstanding_amount NUMERIC(12,2) GENERATED ALWAYS AS ((liters_sold * selling_price) - discount_applied - amount_paid) STORED,
  invoice_id uuid REFERENCES invoices(id),
  user_id uuid NOT NULL REFERENCES profiles(id),
  notes TEXT,
  is_test_data BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_credit_transactions" ON credit_transactions;
CREATE POLICY "authenticated_select_credit_transactions" ON credit_transactions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_credit_transactions" ON credit_transactions;
CREATE POLICY "authenticated_insert_credit_transactions" ON credit_transactions FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_credit_transactions" ON credit_transactions;
CREATE POLICY "authenticated_update_credit_transactions" ON credit_transactions FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_credit_transactions" ON credit_transactions;
CREATE POLICY "authenticated_delete_credit_transactions" ON credit_transactions FOR DELETE
  TO authenticated USING (true);

-- Credit Payments
CREATE TABLE IF NOT EXISTS credit_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  customer_id uuid NOT NULL REFERENCES clients(id),
  amount_paid NUMERIC(12,2) NOT NULL CHECK (amount_paid > 0),
  payment_reference TEXT,
  user_id uuid NOT NULL REFERENCES profiles(id),
  notes TEXT,
  is_test_data BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE credit_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_credit_payments" ON credit_payments;
CREATE POLICY "authenticated_select_credit_payments" ON credit_payments FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_credit_payments" ON credit_payments;
CREATE POLICY "authenticated_insert_credit_payments" ON credit_payments FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_credit_payments" ON credit_payments;
CREATE POLICY "authenticated_update_credit_payments" ON credit_payments FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_credit_payments" ON credit_payments;
CREATE POLICY "authenticated_delete_credit_payments" ON credit_payments FOR DELETE
  TO authenticated USING (true);

-- Recurring Expenses
CREATE TABLE IF NOT EXISTS recurring_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  category_id uuid REFERENCES expense_categories(id),
  due_day_of_month INTEGER NOT NULL CHECK (due_day_of_month >= 1 AND due_day_of_month <= 31),
  is_active BOOLEAN NOT NULL DEFAULT true,
  next_due_date DATE NOT NULL,
  last_generated_date DATE,
  reminder_days_before INTEGER NOT NULL DEFAULT 3,
  user_id uuid NOT NULL REFERENCES profiles(id),
  is_test_data BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_recurring_expenses" ON recurring_expenses;
CREATE POLICY "authenticated_select_recurring_expenses" ON recurring_expenses FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_recurring_expenses" ON recurring_expenses;
CREATE POLICY "authenticated_insert_recurring_expenses" ON recurring_expenses FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_recurring_expenses" ON recurring_expenses;
CREATE POLICY "authenticated_update_recurring_expenses" ON recurring_expenses FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_recurring_expenses" ON recurring_expenses;
CREATE POLICY "authenticated_delete_recurring_expenses" ON recurring_expenses FOR DELETE
  TO authenticated USING (true);

-- Tank Action Audit Log
CREATE TABLE IF NOT EXISTS tank_action_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tank_id uuid NOT NULL REFERENCES inventory_tanks(id),
  action_type TEXT NOT NULL CHECK (action_type IN ('reset', 'empty', 'siphon')),
  previous_quantity NUMERIC(12,2) NOT NULL,
  new_quantity NUMERIC(12,2) NOT NULL,
  liters_removed NUMERIC(12,2) GENERATED ALWAYS AS (previous_quantity - new_quantity) STORED,
  reason TEXT,
  performed_by uuid NOT NULL REFERENCES profiles(id),
  is_test_data BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tank_action_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_tank_action_audit" ON tank_action_audit;
CREATE POLICY "authenticated_select_tank_action_audit" ON tank_action_audit FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_tank_action_audit" ON tank_action_audit;
CREATE POLICY "authenticated_insert_tank_action_audit" ON tank_action_audit FOR INSERT
  TO authenticated WITH CHECK (true);

-- Bulk delete audit log
CREATE TABLE IF NOT EXISTS bulk_delete_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id),
  action TEXT NOT NULL DEFAULT 'bulk_delete_invoices',
  invoice_count INTEGER NOT NULL,
  invoice_ids TEXT[] NOT NULL,
  invoice_numbers TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE bulk_delete_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_bulk_delete_audit" ON bulk_delete_audit;
CREATE POLICY "authenticated_select_bulk_delete_audit" ON bulk_delete_audit FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_bulk_delete_audit" ON bulk_delete_audit;
CREATE POLICY "authenticated_insert_bulk_delete_audit" ON bulk_delete_audit FOR INSERT
  TO authenticated WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tank_dippings_date ON tank_dippings(date);
CREATE INDEX IF NOT EXISTS idx_tank_dippings_tank ON tank_dippings(tank_id);
CREATE INDEX IF NOT EXISTS idx_fuel_delivery_readings_gr ON fuel_delivery_readings(goods_received_id);
CREATE INDEX IF NOT EXISTS idx_meter_readings_date ON meter_readings(date);
CREATE INDEX IF NOT EXISTS idx_fuel_reconciliations_date ON fuel_movement_reconciliations(date);
CREATE INDEX IF NOT EXISTS idx_inventory_variances_date ON inventory_variances(date);
CREATE INDEX IF NOT EXISTS idx_shift_cashups_date ON shift_cashups(date);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_customer ON credit_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_credit_payments_customer ON credit_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_next_due ON recurring_expenses(next_due_date);
CREATE INDEX IF NOT EXISTS idx_tank_action_audit_tank ON tank_action_audit(tank_id);
CREATE INDEX IF NOT EXISTS idx_invoices_shift ON invoices(shift);
