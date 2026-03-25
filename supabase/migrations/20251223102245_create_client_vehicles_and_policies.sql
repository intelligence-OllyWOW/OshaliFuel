/*
  # Create Client Vehicles Table and Complete Policies

  1. New Tables
    - `client_vehicles`
      - `id` (uuid, primary key)
      - `client_id` (uuid) - References clients table
      - `registration_number` (text) - Vehicle registration number
      - `make` (text) - Vehicle make (optional)
      - `model` (text) - Vehicle model (optional)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on client_vehicles table
    - Add remaining policies for clients table
*/

CREATE TABLE IF NOT EXISTS client_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  registration_number text NOT NULL,
  make text,
  model text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE client_vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "GM and Super Admin can insert clients" ON clients;
DROP POLICY IF EXISTS "GM and Super Admin can update clients" ON clients;
DROP POLICY IF EXISTS "GM and Super Admin can delete clients" ON clients;

CREATE POLICY "GM and Super Admin can insert clients"
  ON clients FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'general_manager')
    )
  );

CREATE POLICY "GM and Super Admin can update clients"
  ON clients FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'general_manager')
    )
  );

CREATE POLICY "GM and Super Admin can delete clients"
  ON clients FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'general_manager')
    )
  );

DROP POLICY IF EXISTS "Authenticated users can view client vehicles" ON client_vehicles;
DROP POLICY IF EXISTS "GM and Super Admin can insert client vehicles" ON client_vehicles;
DROP POLICY IF EXISTS "GM and Super Admin can update client vehicles" ON client_vehicles;
DROP POLICY IF EXISTS "GM and Super Admin can delete client vehicles" ON client_vehicles;

CREATE POLICY "Authenticated users can view client vehicles"
  ON client_vehicles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "GM and Super Admin can insert client vehicles"
  ON client_vehicles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'general_manager')
    )
  );

CREATE POLICY "GM and Super Admin can update client vehicles"
  ON client_vehicles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'general_manager')
    )
  );

CREATE POLICY "GM and Super Admin can delete client vehicles"
  ON client_vehicles FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'general_manager')
    )
  );

CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_client_vehicles_client_id ON client_vehicles(client_id);
CREATE INDEX IF NOT EXISTS idx_client_vehicles_registration ON client_vehicles(registration_number);