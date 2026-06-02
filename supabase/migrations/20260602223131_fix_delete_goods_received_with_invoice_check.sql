/*
  # Fix delete_goods_received to handle existing invoice references

  1. Problem
    - The existing delete_goods_received function fails silently with a foreign key
      constraint error when any inventory_items linked to the GR have been used in
      invoice_line_items. This produces an "Unknown error" in the UI.

  2. Solution
    - Update delete_goods_received() to first check whether any invoice_line_items
      reference inventory_items belonging to the GR being deleted.
    - If so, raise a clear exception listing the affected invoice numbers so the
      user knows which invoices to delete or void first.
    - The error is raised with a friendly message that bubbles up through Supabase
      RPC to the frontend.

  3. Security
    - Function remains SECURITY DEFINER (no permission change).
    - No data loss: the function aborts cleanly before any deletes occur when
      invoices reference the GR.
*/

CREATE OR REPLACE FUNCTION delete_goods_received(p_gr_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_items integer := 0;
  v_liters_removed numeric := 0;
  v_po_id uuid;
  v_blocking_invoice_count integer := 0;
  v_blocking_invoice_numbers text;
BEGIN
  SELECT po_id INTO v_po_id FROM goods_received WHERE id = p_gr_id;

  IF v_po_id IS NULL THEN
    RAISE EXCEPTION 'Goods Received record not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT
    COUNT(DISTINCT ili.invoice_id),
    string_agg(DISTINCT i.invoice_number, ', ' ORDER BY i.invoice_number)
  INTO v_blocking_invoice_count, v_blocking_invoice_numbers
  FROM invoice_line_items ili
  JOIN inventory_items ii ON ii.id = ili.inventory_item_id
  JOIN invoices i ON i.id = ili.invoice_id
  WHERE ii.gr_id = p_gr_id;

  IF v_blocking_invoice_count > 0 THEN
    RAISE EXCEPTION
      'Cannot delete this Goods Received record because its inventory has been used on % invoice(s): %. Please delete or void these invoices first.',
      v_blocking_invoice_count,
      v_blocking_invoice_numbers
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(SUM(remaining_liters), 0), COUNT(*)
  INTO v_liters_removed, v_deleted_items
  FROM inventory_items WHERE gr_id = p_gr_id;

  WITH tank_totals AS (
    SELECT tank_id, SUM(remaining_liters) as total_liters
    FROM inventory_items
    WHERE gr_id = p_gr_id
    GROUP BY tank_id
  )
  UPDATE inventory_tanks t
  SET current_liters = GREATEST(0, t.current_liters - tt.total_liters),
      updated_at = now()
  FROM tank_totals tt
  WHERE t.id = tt.tank_id;

  DELETE FROM inventory_items WHERE gr_id = p_gr_id;
  DELETE FROM goods_received WHERE id = p_gr_id;

  UPDATE purchase_orders
  SET status = 'paid', updated_at = now()
  WHERE id = v_po_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted', jsonb_build_object(
      'goods_received', 1,
      'inventory_items', v_deleted_items
    ),
    'tank_level_decreased_liters', v_liters_removed,
    'po_status_reverted', true
  );
END;
$$;
