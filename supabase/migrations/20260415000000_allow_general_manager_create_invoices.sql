-- Allow general_manager to create invoices
DROP POLICY IF EXISTS "Pump attendants can create invoices" ON invoices;

CREATE POLICY "Authorized roles can create invoices"
  ON invoices FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN (
        'pump_attendant',
        'operations_supervisor',
        'super_admin',
        'general_manager'
      )
    )
  );
