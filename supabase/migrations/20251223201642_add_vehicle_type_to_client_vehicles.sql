/*
  # Add Vehicle Type to Client Vehicles

  1. Changes
    - Create enum type for vehicle types: bus, truck, suv, pickup, other
    - Add `vehicle_type` column to client_vehicles table
    
  2. Notes
    - Column is nullable to allow existing records
    - Enum values are lowercase for consistency with database naming conventions
*/

-- Create vehicle type enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'client_vehicle_type') THEN
    CREATE TYPE client_vehicle_type AS ENUM ('bus', 'truck', 'suv', 'pickup', 'other');
  END IF;
END $$;

-- Add vehicle_type column to client_vehicles table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_vehicles' AND column_name = 'vehicle_type'
  ) THEN
    ALTER TABLE client_vehicles ADD COLUMN vehicle_type client_vehicle_type;
  END IF;
END $$;
