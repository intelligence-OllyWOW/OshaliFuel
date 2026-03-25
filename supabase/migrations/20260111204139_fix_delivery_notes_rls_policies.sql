/*
  # Fix Delivery Notes RLS Policies

  1. Changes
    - Update INSERT policy to allow pump_attendant, attendant, operations_supervisor, and admins
    - Update SELECT policy for attendants to include pump_attendant role
    - Add policy for operations supervisors and admins to update delivery notes

  2. Security
    - Maintains proper access control
    - Allows appropriate roles to create and manage delivery notes
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Attendants can create own delivery notes" ON delivery_notes;
DROP POLICY IF EXISTS "Attendants can view own delivery notes" ON delivery_notes;
DROP POLICY IF EXISTS "Managers and admins can view all delivery notes" ON delivery_notes;
DROP POLICY IF EXISTS "Admins can update delivery notes" ON delivery_notes;
DROP POLICY IF EXISTS "Admins can delete delivery notes" ON delivery_notes;

-- Create new policies with correct roles

-- Allow attendants and pump attendants to create their own delivery notes
CREATE POLICY "Attendants can create own delivery notes"
  ON delivery_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    attendant_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('attendant', 'pump_attendant', 'operations_supervisor', 'super_admin', 'administrator')
    )
  );

-- Allow attendants to view their own delivery notes
CREATE POLICY "Attendants can view own delivery notes"
  ON delivery_notes
  FOR SELECT
  TO authenticated
  USING (
    attendant_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('attendant', 'pump_attendant')
    )
  );

-- Allow managers and admins to view all delivery notes
CREATE POLICY "Managers and admins can view all delivery notes"
  ON delivery_notes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'general_manager', 'administrator', 'finance', 'operations_supervisor')
    )
  );

-- Allow operations supervisors and admins to update delivery notes
CREATE POLICY "Supervisors and admins can update delivery notes"
  ON delivery_notes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'administrator', 'operations_supervisor', 'finance')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'administrator', 'operations_supervisor', 'finance')
    )
  );

-- Allow admins to delete delivery notes
CREATE POLICY "Admins can delete delivery notes"
  ON delivery_notes
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'administrator')
    )
  );
