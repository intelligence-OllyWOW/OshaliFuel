/*
  # Fix Invoice Delete Functionality

  1. Problem
    - The trigger `restore_tank_on_invoice_delete` references non-existent `tanks` table
    - Should reference `inventory_tanks` instead
    - This causes "Unknown error" when deleting invoices

  2. Solution
    - Drop the broken triggers
    - Update `delete_invoice` function to handle all cleanup properly
    - The function already does the cleanup work, triggers were duplicating it
*/

DROP TRIGGER IF EXISTS trigger_restore_inventory_on_invoice_delete ON invoices;
DROP TRIGGER IF EXISTS trigger_restore_tank_on_invoice_delete ON invoices;
DROP TRIGGER IF EXISTS trigger_update_delivery_note_on_invoice_delete ON invoices;

DROP FUNCTION IF EXISTS restore_inventory_on_invoice_delete();
DROP FUNCTION IF EXISTS restore_tank_on_invoice_delete();
DROP FUNCTION IF EXISTS update_delivery_note_on_invoice_delete();

CREATE OR REPLACE FUNCTION delete_invoice(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_line_items integer := 0;
  v_liters_restored numeric := 0;
  v_updated_dns integer := 0;
  v_line_item record;
  v_invoice record;
BEGIN
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  
  IF v_invoice IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  FOR v_line_item IN 
    SELECT inventory_item_id, liters_from_item 
    FROM invoice_line_items 
    WHERE invoice_id = p_invoice_id
  LOOP
    UPDATE inventory_items
    SET remaining_liters = remaining_liters + v_line_item.liters_from_item,
        updated_at = now()
    WHERE id = v_line_item.inventory_item_id;

    v_liters_restored := v_liters_restored + v_line_item.liters_from_item;
    v_deleted_line_items := v_deleted_line_items + 1;
  END LOOP;

  WITH item_tanks AS (
    SELECT ii.tank_id, SUM(ili.liters_from_item) as total_liters
    FROM invoice_line_items ili
    JOIN inventory_items ii ON ii.id = ili.inventory_item_id
    WHERE ili.invoice_id = p_invoice_id
    GROUP BY ii.tank_id
  )
  UPDATE inventory_tanks t
  SET current_liters = t.current_liters + it.total_liters,
      updated_at = now()
  FROM item_tanks it
  WHERE t.id = it.tank_id;

  UPDATE delivery_notes
  SET invoice_id = NULL, has_invoice = false, updated_at = now()
  WHERE invoice_id = p_invoice_id;
  GET DIAGNOSTICS v_updated_dns = ROW_COUNT;

  DELETE FROM invoice_line_items WHERE invoice_id = p_invoice_id;

  DELETE FROM invoices WHERE id = p_invoice_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted', jsonb_build_object(
      'invoices', 1,
      'invoice_line_items', v_deleted_line_items
    ),
    'updated', jsonb_build_object(
      'delivery_notes_unlinked', v_updated_dns
    ),
    'inventory_restored_liters', v_liters_restored,
    'tank_level_increased_liters', v_liters_restored
  );
END;
$$;
