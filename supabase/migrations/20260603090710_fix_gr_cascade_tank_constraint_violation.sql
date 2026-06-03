/*
  # Fix tank constraint violation in GR cascade deletion

  1. Problem
    - The previous `delete_goods_received_cascade` function called `delete_invoice`
      for every linked invoice. `delete_invoice` restores liters to
      `inventory_tanks.current_liters` first, which can transiently exceed
      `capacity_liters` and violate `inventory_tanks_check` even when the final
      state (after subsequent GR deletion) is valid.

  2. Solution
    - Rewrite `delete_goods_received_cascade` to perform all work inline and apply
      a single net delta to each tank:
        - Subtract the remaining_liters of every inventory_item belonging to the
          cascaded GRs (these are being deleted entirely).
        - Add back the liters that go to inventory_items NOT being deleted but
          referenced by the to-be-deleted invoices (these inventory items live in
          GRs the user is keeping).
      The net delta is applied once, after which the final state stays inside
      [0, capacity_liters].
    - Inventory rows that are NOT being deleted but had stock consumed by
      cancelled invoices have their `remaining_liters` restored.
    - Delivery notes that referenced the cancelled invoices are unlinked.
    - Affected purchase orders are reverted to status `paid`.

  3. Security
    - Function remains SECURITY DEFINER. No tables added or modified beyond the
      existing deletion logic.
*/

CREATE OR REPLACE FUNCTION delete_goods_received_cascade(p_gr_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice_ids uuid[];
  v_invoices_deleted integer := 0;
  v_grs_deleted integer := 0;
  v_inventory_items_deleted integer := 0;
  v_total_tank_decrease numeric := 0;
  v_dns_unlinked integer := 0;
BEGIN
  IF p_gr_ids IS NULL OR array_length(p_gr_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No Goods Received records provided' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT ili.invoice_id), ARRAY[]::uuid[])
  INTO v_invoice_ids
  FROM invoice_line_items ili
  JOIN inventory_items ii ON ii.id = ili.inventory_item_id
  WHERE ii.gr_id = ANY(p_gr_ids);

  WITH
    -- Liters being removed from tanks because their GR's inventory is deleted
    deleted_inventory_per_tank AS (
      SELECT tank_id, SUM(remaining_liters) AS liters_removed
      FROM inventory_items
      WHERE gr_id = ANY(p_gr_ids)
      GROUP BY tank_id
    ),
    -- Liters restored to tanks because invoices referencing inventory in
    -- non-cascaded GRs are being deleted
    restored_inventory_per_tank AS (
      SELECT ii.tank_id, SUM(ili.liters_from_item) AS liters_restored
      FROM invoice_line_items ili
      JOIN inventory_items ii ON ii.id = ili.inventory_item_id
      WHERE ili.invoice_id = ANY(v_invoice_ids)
        AND (ii.gr_id IS NULL OR NOT (ii.gr_id = ANY(p_gr_ids)))
      GROUP BY ii.tank_id
    ),
    net_delta AS (
      SELECT
        COALESCE(d.tank_id, r.tank_id) AS tank_id,
        COALESCE(r.liters_restored, 0) - COALESCE(d.liters_removed, 0) AS delta
      FROM deleted_inventory_per_tank d
      FULL OUTER JOIN restored_inventory_per_tank r ON r.tank_id = d.tank_id
    )
  UPDATE inventory_tanks t
  SET current_liters = GREATEST(0, LEAST(t.capacity_liters, t.current_liters + nd.delta)),
      updated_at = now()
  FROM net_delta nd
  WHERE t.id = nd.tank_id;

  -- Restore remaining_liters on inventory items that survive (not being deleted)
  -- but were partially consumed by the cancelled invoices
  UPDATE inventory_items ii
  SET remaining_liters = remaining_liters + sub.liters_restored,
      updated_at = now()
  FROM (
    SELECT ili.inventory_item_id, SUM(ili.liters_from_item) AS liters_restored
    FROM invoice_line_items ili
    WHERE ili.invoice_id = ANY(v_invoice_ids)
    GROUP BY ili.inventory_item_id
  ) sub
  WHERE ii.id = sub.inventory_item_id
    AND (ii.gr_id IS NULL OR NOT (ii.gr_id = ANY(p_gr_ids)));

  -- Track total tank decrease (sum of removed liters across cascade GRs)
  SELECT COALESCE(SUM(remaining_liters), 0)
  INTO v_total_tank_decrease
  FROM inventory_items
  WHERE gr_id = ANY(p_gr_ids);

  SELECT COUNT(*)
  INTO v_inventory_items_deleted
  FROM inventory_items
  WHERE gr_id = ANY(p_gr_ids);

  -- Unlink delivery notes from soon-to-be-deleted invoices
  IF array_length(v_invoice_ids, 1) IS NOT NULL THEN
    UPDATE delivery_notes
    SET invoice_id = NULL, has_invoice = false, updated_at = now()
    WHERE invoice_id = ANY(v_invoice_ids);
    GET DIAGNOSTICS v_dns_unlinked = ROW_COUNT;

    DELETE FROM invoice_line_items WHERE invoice_id = ANY(v_invoice_ids);
    DELETE FROM invoices WHERE id = ANY(v_invoice_ids);
    v_invoices_deleted := array_length(v_invoice_ids, 1);
  END IF;

  -- Capture POs that need status reverted
  WITH affected_pos AS (
    SELECT DISTINCT po_id FROM goods_received WHERE id = ANY(p_gr_ids)
  )
  UPDATE purchase_orders po
  SET status = 'paid', updated_at = now()
  FROM affected_pos
  WHERE po.id = affected_pos.po_id;

  DELETE FROM inventory_items WHERE gr_id = ANY(p_gr_ids);
  DELETE FROM goods_received WHERE id = ANY(p_gr_ids);
  GET DIAGNOSTICS v_grs_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'goods_received_deleted', v_grs_deleted,
    'invoices_deleted', v_invoices_deleted,
    'inventory_items_deleted', v_inventory_items_deleted,
    'tank_decrease_liters', v_total_tank_decrease,
    'delivery_notes_unlinked', v_dns_unlinked
  );
END;
$$;
