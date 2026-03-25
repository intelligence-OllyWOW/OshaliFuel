/*
  # Add Tank D to Inventory

  1. Changes
    - Update tank_name check constraint to allow 'D'
    - Insert Tank D with 23,000L capacity into inventory_tanks table

  2. Notes
    - This brings the total to 4 tanks (A, B, C, D)
    - Tank D starts empty (0 liters)
*/

ALTER TABLE inventory_tanks DROP CONSTRAINT IF EXISTS inventory_tanks_tank_name_check;

ALTER TABLE inventory_tanks ADD CONSTRAINT inventory_tanks_tank_name_check 
  CHECK (tank_name = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'D'::text]));

INSERT INTO inventory_tanks (tank_name, capacity_liters, current_liters)
VALUES ('D', 23000, 0)
ON CONFLICT DO NOTHING;