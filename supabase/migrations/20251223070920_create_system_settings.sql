/*
  # Create System Settings Table

  1. New Tables
    - `system_settings`
      - Stores system-wide configuration settings
      - `id` (uuid, primary key)
      - `tank_low_level_threshold` (numeric) - Percentage threshold for low tank level warning (default: 20)
      - `tank_high_level_threshold` (numeric) - Percentage threshold for high tank level warning (default: 90)
      - `tank_critical_level_threshold` (numeric) - Percentage threshold for critical tank level alert (default: 10)
      - `updated_at` (timestamp)
      - `updated_by` (uuid) - References profiles table

  2. Security
    - Enable RLS on `system_settings` table
    - All authenticated users can view settings
    - Only super_admin and general_manager can update settings

  3. Notes
    - Single row table pattern - only one settings record exists
    - Default thresholds set to maintain current behavior
    - Critical threshold added for future enhancements
*/

CREATE TABLE IF NOT EXISTS system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tank_low_level_threshold numeric DEFAULT 20 NOT NULL CHECK (tank_low_level_threshold >= 0 AND tank_low_level_threshold <= 100),
  tank_high_level_threshold numeric DEFAULT 90 NOT NULL CHECK (tank_high_level_threshold >= 0 AND tank_high_level_threshold <= 100),
  tank_critical_level_threshold numeric DEFAULT 10 NOT NULL CHECK (tank_critical_level_threshold >= 0 AND tank_critical_level_threshold <= 100),
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES profiles(id)
);

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view system settings"
  ON system_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Super admin and GM can update system settings"
  ON system_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'general_manager')
    )
  );

CREATE POLICY "Super admin can insert system settings"
  ON system_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

INSERT INTO system_settings (tank_low_level_threshold, tank_high_level_threshold, tank_critical_level_threshold)
VALUES (20, 90, 10)
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_system_settings_id ON system_settings(id);