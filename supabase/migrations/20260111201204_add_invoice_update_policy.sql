/*
  # Add Invoice Update Policy

  1. Changes
    - Add UPDATE policy for invoices table to allow authorized users to update invoice status
    - Allows operations_supervisor, administrator, super_admin, and general_manager roles to update invoices
  
  2. Security
    - Only authenticated users with specific roles can update invoices
    - Policy checks user role from profiles table
*/

CREATE POLICY "Authorized users can update invoices"
  ON invoices
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('operations_supervisor', 'administrator', 'super_admin', 'general_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('operations_supervisor', 'administrator', 'super_admin', 'general_manager')
    )
  );
