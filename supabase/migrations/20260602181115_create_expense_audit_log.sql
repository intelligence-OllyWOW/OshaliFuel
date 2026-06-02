/*
  # Expense Audit Log

  1. New Tables
    - `expense_audit_log`
      - `id` (uuid, primary key)
      - `expense_id` (uuid, original expense ID)
      - `expense_number` (text, for reference after deletion)
      - `title` (text, expense title at time of deletion)
      - `amount` (numeric, expense amount)
      - `action` (text, e.g. 'deleted')
      - `performed_by` (uuid, references profiles)
      - `reason` (text, optional reason for deletion)
      - `metadata` (jsonb, full snapshot of deleted record)
      - `created_at` (timestamptz)

  2. Security
    - RLS enabled
    - Finance and super_admin can view audit logs
    - Only system (via authenticated insert) can write logs

  3. Notes
    - This table preserves a record of deleted expenses for accountability
    - The metadata column stores a full JSON snapshot of the expense at deletion time
*/

CREATE TABLE IF NOT EXISTS expense_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL,
  expense_number text NOT NULL,
  title text NOT NULL,
  amount numeric NOT NULL,
  action text NOT NULL DEFAULT 'deleted',
  performed_by uuid NOT NULL REFERENCES profiles(id),
  reason text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE expense_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance and super admin can view expense audit logs"
  ON expense_audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'finance', 'general_manager')
    )
  );

CREATE POLICY "Finance and super admin can insert expense audit logs"
  ON expense_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (
    performed_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'finance')
    )
  );

CREATE INDEX IF NOT EXISTS idx_expense_audit_log_expense_id ON expense_audit_log(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_audit_log_performed_by ON expense_audit_log(performed_by);
CREATE INDEX IF NOT EXISTS idx_expense_audit_log_created_at ON expense_audit_log(created_at);
