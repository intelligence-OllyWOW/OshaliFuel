/*
  # Allow GR cascade deletion with linked invoices

  1. New / Updated Functions
    - `analyze_gr_deletion(p_gr_id uuid)`
      Returns information about what will be deleted when this GR is removed:
      - The list of invoices linked through this GR's inventory
      - "Shared" GRs: other GR records whose inventory those same invoices also
        reference (so the user can opt-in to deleting them as well)
      - Aggregate counts of invoices, line items, and liters that will be reversed
    - `delete_goods_received_cascade(p_gr_ids uuid[])`
      Deletes one or more GRs as a single transaction:
        1. Deletes every invoice that has line items referencing inventory_items
           belonging to ANY of the provided GRs (using the existing delete_invoice
           function, which restores remaining_liters and tank levels).
        2. Deletes the inventory_items for each GR, decrementing tank levels by
           the (now-restored) remaining_liters.
        3. Deletes each GR row.
        4. Reverts each affected purchase_order to status 'paid'.

  2. Why
    - Previously, deleting a GR failed if any of its inventory had been used on
      invoices. We now want a guided cascade: delete linked invoices automatically
      and prompt the user about other "shared" GRs that the same invoice touches.

  3. Security
    - Both functions are SECURITY DEFINER and only operate on the tables already
      managed by the existing deletion functions. RLS on those tables is
      unchanged. No new tables introduced.
*/

CREATE OR REPLACE FUNCTION analyze_gr_deletion(p_gr_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_invoices jsonb;
  v_shared_grs jsonb;
  v_total_invoices integer := 0;
  v_total_line_items integer := 0;
  v_total_liters_restored numeric := 0;
  v_total_inventory_items integer := 0;
  v_total_remaining_liters numeric := 0;
  v_gr_number text;
BEGIN
  SELECT gr_number INTO v_gr_number FROM goods_received WHERE id = p_gr_id;

  IF v_gr_number IS NULL THEN
    RAISE EXCEPTION 'Goods Received record not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(remaining_liters), 0)
  INTO v_total_inventory_items, v_total_remaining_liters
  FROM inventory_items
  WHERE gr_id = p_gr_id;

  SELECT
    COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
      'id', i.id,
      'invoice_number', i.invoice_number,
      'total_amount', i.total_amount,
      'status', i.status,
      'invoice_date', i.invoice_date
    )), '[]'::jsonb),
    COUNT(DISTINCT i.id),
    COUNT(ili.id),
    COALESCE(SUM(ili.liters_from_item), 0)
  INTO v_invoices, v_total_invoices, v_total_line_items, v_total_liters_restored
  FROM invoices i
  JOIN invoice_line_items ili ON ili.invoice_id = i.id
  JOIN inventory_items ii ON ii.id = ili.inventory_item_id
  WHERE ii.gr_id = p_gr_id;

  WITH affected_invoices AS (
    SELECT DISTINCT i.id AS invoice_id, i.invoice_number
    FROM invoices i
    JOIN invoice_line_items ili ON ili.invoice_id = i.id
    JOIN inventory_items ii ON ii.id = ili.inventory_item_id
    WHERE ii.gr_id = p_gr_id
  ),
  shared_gr_links AS (
    SELECT
      ii2.gr_id AS shared_gr_id,
      ai.invoice_id,
      ai.invoice_number
    FROM affected_invoices ai
    JOIN invoice_line_items ili2 ON ili2.invoice_id = ai.invoice_id
    JOIN inventory_items ii2 ON ii2.id = ili2.inventory_item_id
    WHERE ii2.gr_id IS NOT NULL
      AND ii2.gr_id <> p_gr_id
  )
  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO v_shared_grs
  FROM (
    SELECT
      gr.id,
      gr.gr_number,
      gr.created_at,
      gr.po_id,
      jsonb_agg(DISTINCT jsonb_build_object(
        'id', s.invoice_id,
        'invoice_number', s.invoice_number
      )) AS shared_invoices
    FROM shared_gr_links s
    JOIN goods_received gr ON gr.id = s.shared_gr_id
    GROUP BY gr.id, gr.gr_number, gr.created_at, gr.po_id
    ORDER BY gr.created_at DESC
  ) t;

  v_result := jsonb_build_object(
    'gr_id', p_gr_id,
    'gr_number', v_gr_number,
    'inventory_items_to_delete', v_total_inventory_items,
    'tank_decrease_liters', v_total_remaining_liters,
    'invoices_to_delete', v_total_invoices,
    'invoice_line_items_to_delete', v_total_line_items,
    'liters_restored_to_inventory', v_total_liters_restored,
    'invoices', v_invoices,
    'shared_grs', v_shared_grs
  );

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION delete_goods_received_cascade(p_gr_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice_id uuid;
  v_gr_id uuid;
  v_invoices_deleted integer := 0;
  v_grs_deleted integer := 0;
  v_inventory_items_deleted integer := 0;
  v_total_tank_decrease numeric := 0;
  v_po_id uuid;
  v_gr_inventory_count integer;
  v_gr_remaining_liters numeric;
BEGIN
  IF p_gr_ids IS NULL OR array_length(p_gr_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No Goods Received records provided' USING ERRCODE = 'P0001';
  END IF;

  FOR v_invoice_id IN
    SELECT DISTINCT ili.invoice_id
    FROM invoice_line_items ili
    JOIN inventory_items ii ON ii.id = ili.inventory_item_id
    WHERE ii.gr_id = ANY(p_gr_ids)
  LOOP
    PERFORM delete_invoice(v_invoice_id);
    v_invoices_deleted := v_invoices_deleted + 1;
  END LOOP;

  FOREACH v_gr_id IN ARRAY p_gr_ids
  LOOP
    SELECT po_id INTO v_po_id FROM goods_received WHERE id = v_gr_id;

    IF v_po_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT COUNT(*), COALESCE(SUM(remaining_liters), 0)
    INTO v_gr_inventory_count, v_gr_remaining_liters
    FROM inventory_items
    WHERE gr_id = v_gr_id;

    WITH tank_totals AS (
      SELECT tank_id, SUM(remaining_liters) AS total_liters
      FROM inventory_items
      WHERE gr_id = v_gr_id
      GROUP BY tank_id
    )
    UPDATE inventory_tanks t
    SET current_liters = GREATEST(0, t.current_liters - tt.total_liters),
        updated_at = now()
    FROM tank_totals tt
    WHERE t.id = tt.tank_id;

    DELETE FROM inventory_items WHERE gr_id = v_gr_id;
    DELETE FROM goods_received WHERE id = v_gr_id;

    UPDATE purchase_orders
    SET status = 'paid', updated_at = now()
    WHERE id = v_po_id;

    v_grs_deleted := v_grs_deleted + 1;
    v_inventory_items_deleted := v_inventory_items_deleted + v_gr_inventory_count;
    v_total_tank_decrease := v_total_tank_decrease + v_gr_remaining_liters;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'goods_received_deleted', v_grs_deleted,
    'invoices_deleted', v_invoices_deleted,
    'inventory_items_deleted', v_inventory_items_deleted,
    'tank_decrease_liters', v_total_tank_decrease
  );
END;
$$;
