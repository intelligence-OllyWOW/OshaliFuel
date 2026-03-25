/*
  # Add Attendant Role and Delivery Notes

  1. Changes
    - Add 'attendant' role to user_role enum
    - Create delivery_notes table for recording fuel dispensing

  2. New Tables
    - `delivery_notes`
      - `id` (uuid, primary key)
      - `note_number` (text, unique) - Auto-generated delivery note number
      - `client_id` (uuid, nullable) - Reference to clients table (null for custom customers)
      - `customer_name` (text) - Customer name (from client or entered manually)
      - `vehicle_registration` (text) - Vehicle registration number
      - `driver_name` (text) - Name of the driver
      - `meter_reading_a` (numeric) - Meter reading A
      - `meter_reading_b` (numeric) - Meter reading B
      - `litres_dispensed` (numeric) - Calculated litres dispensed
      - `attendant_id` (uuid) - Reference to profiles table
      - `attendant_name` (text) - Name of the attendant
      - `created_at` (timestamptz) - Auto-populated timestamp
      - `updated_at` (timestamptz) - Auto-updated timestamp

  3. Security
    - Enable RLS on delivery_notes table
    - Add policy for attendants to insert their own delivery notes
    - Add policy for attendants to view their own delivery notes
    - Add policy for managers and admins to view all delivery notes
*/

-- Add 'attendant' to user_role enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'attendant'
  ) THEN
    ALTER TYPE user_role ADD VALUE 'attendant';
  END IF;
END $$;

-- Create delivery_notes table
CREATE TABLE IF NOT EXISTS delivery_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_number text UNIQUE NOT NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  vehicle_registration text NOT NULL,
  driver_name text NOT NULL,
  meter_reading_a numeric NOT NULL DEFAULT 0,
  meter_reading_b numeric NOT NULL DEFAULT 0,
  litres_dispensed numeric NOT NULL DEFAULT 0,
  attendant_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  attendant_name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index on attendant_id for faster queries
CREATE INDEX IF NOT EXISTS idx_delivery_notes_attendant_id ON delivery_notes(attendant_id);

-- Create index on client_id for faster queries
CREATE INDEX IF NOT EXISTS idx_delivery_notes_client_id ON delivery_notes(client_id);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_delivery_notes_created_at ON delivery_notes(created_at DESC);

-- Enable RLS
ALTER TABLE delivery_notes ENABLE ROW LEVEL SECURITY;

-- Policy: Attendants can insert their own delivery notes
CREATE POLICY "Attendants can create own delivery notes"
  ON delivery_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    attendant_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'attendant'
    )
  );

-- Policy: Attendants can view their own delivery notes
CREATE POLICY "Attendants can view own delivery notes"
  ON delivery_notes
  FOR SELECT
  TO authenticated
  USING (
    attendant_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'attendant'
    )
  );

-- Policy: Managers and admins can view all delivery notes
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

-- Policy: Admins can update delivery notes
CREATE POLICY "Admins can update delivery notes"
  ON delivery_notes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'administrator')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'administrator')
    )
  );

-- Policy: Admins can delete delivery notes
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
