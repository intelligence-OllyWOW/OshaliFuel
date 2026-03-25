/*
  # Add Document Deletion Functions for Super Admin
  
  1. Functions Created
    - `delete_purchase_requisition(pr_id)` - Deletes PR and cascades to PO, GR, inventory
    - `delete_purchase_order(po_id)` - Deletes PO and cascades to GR, inventory
    - `delete_goods_received(gr_id)` - Deletes GR and associated inventory items, updates tank levels
    - `delete_invoice(invoice_id)` - Deletes invoice, restores inventory, updates tank levels
    - `delete_delivery_note(dn_id)` - Deletes delivery note, unlinks from invoice if needed
    - `get_deletion_impact(doc_type, doc_id)` - Returns JSON with impact analysis
  
  2. Cascade Behavior
    - PR deletion: Cascades to PO -> GR -> inventory_items -> invoice_line_items
    - PO deletion: Cascades to GR -> inventory_items -> invoice_line_items  
    - GR deletion: Deletes inventory_items, decreases tank levels
    - Invoice deletion: Restores inventory remaining_liters, increases tank levels
    - Delivery Note deletion: Unlinks from invoice, does not delete invoice
  
  3. Tank Level Updates
    - GR deletion: Tank level DECREASES by the liters that were in inventory
    - Invoice deletion: Tank level INCREASES by restoring sold liters to inventory
  
  4. Security
    - Functions are security definer to allow proper cascade operations
    - Should only be called by super_admin role (enforced in application)
*/

CREATE OR REPLACE FUNCTION get_deletion_impact(
  p_doc_type text,
  p_doc_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_pr_count integer;
  v_po_count integer;
  v_gr_count integer;
  v_inv_item_count integer;
  v_invoice_count integer;
  v_line_item_count integer;
  v_dn_count integer;
  v_liters_to_restore numeric;
  v_liters_to_remove numeric;
  v_doc_number text;
BEGIN
  CASE p_doc_type
    WHEN 'PR' THEN
      SELECT pr_number INTO v_doc_number FROM purchase_requisitions WHERE id = p_doc_id;
      SELECT COUNT(*) INTO v_po_count FROM purchase_orders WHERE pr_id = p_doc_id;
      SELECT COUNT(*) INTO v_gr_count FROM goods_received WHERE po_id IN (SELECT id FROM purchase_orders WHERE pr_id = p_doc_id);
      SELECT COUNT(*) INTO v_inv_item_count FROM inventory_items WHERE gr_id IN (
        SELECT id FROM goods_received WHERE po_id IN (SELECT id FROM purchase_orders WHERE pr_id = p_doc_id)
      );
      SELECT COUNT(*) INTO v_line_item_count FROM invoice_line_items WHERE inventory_item_id IN (
        SELECT id FROM inventory_items WHERE gr_id IN (
          SELECT id FROM goods_received WHERE po_id IN (SELECT id FROM purchase_orders WHERE pr_id = p_doc_id)
        )
      );
      SELECT COALESCE(SUM(remaining_liters), 0) INTO v_liters_to_remove FROM inventory_items WHERE gr_id IN (
        SELECT id FROM goods_received WHERE po_id IN (SELECT id FROM purchase_orders WHERE pr_id = p_doc_id)
      );
      
      v_result := jsonb_build_object(
        'document_number', v_doc_number,
        'will_delete', jsonb_build_object(
          'purchase_requisitions', 1,
          'purchase_orders', v_po_count,
          'goods_received', v_gr_count,
          'inventory_items', v_inv_item_count
        ),
        'will_update', jsonb_build_object(),
        'will_reverse', jsonb_build_object(
          'tank_level_decrease_liters', v_liters_to_remove
        ),
        'warnings', CASE 
          WHEN v_line_item_count > 0 THEN ARRAY['This PR has been used in ' || v_line_item_count || ' invoice line items. Those invoices will have orphaned line items.']
          ELSE ARRAY[]::text[]
        END
      );
      
    WHEN 'PO' THEN
      SELECT po_number INTO v_doc_number FROM purchase_orders WHERE id = p_doc_id;
      SELECT COUNT(*) INTO v_gr_count FROM goods_received WHERE po_id = p_doc_id;
      SELECT COUNT(*) INTO v_inv_item_count FROM inventory_items WHERE gr_id IN (
        SELECT id FROM goods_received WHERE po_id = p_doc_id
      );
      SELECT COUNT(*) INTO v_line_item_count FROM invoice_line_items WHERE inventory_item_id IN (
        SELECT id FROM inventory_items WHERE gr_id IN (
          SELECT id FROM goods_received WHERE po_id = p_doc_id
        )
      );
      SELECT COALESCE(SUM(remaining_liters), 0) INTO v_liters_to_remove FROM inventory_items WHERE gr_id IN (
        SELECT id FROM goods_received WHERE po_id = p_doc_id
      );
      
      v_result := jsonb_build_object(
        'document_number', v_doc_number,
        'will_delete', jsonb_build_object(
          'purchase_orders', 1,
          'goods_received', v_gr_count,
          'inventory_items', v_inv_item_count
        ),
        'will_update', jsonb_build_object(
          'purchase_requisitions', 'Status will remain unchanged'
        ),
        'will_reverse', jsonb_build_object(
          'tank_level_decrease_liters', v_liters_to_remove
        ),
        'warnings', CASE 
          WHEN v_line_item_count > 0 THEN ARRAY['This PO has been used in ' || v_line_item_count || ' invoice line items. Those invoices will have orphaned line items.']
          ELSE ARRAY[]::text[]
        END
      );
      
    WHEN 'GR' THEN
      SELECT gr_number INTO v_doc_number FROM goods_received WHERE id = p_doc_id;
      SELECT COUNT(*) INTO v_inv_item_count FROM inventory_items WHERE gr_id = p_doc_id;
      SELECT COUNT(*) INTO v_line_item_count FROM invoice_line_items WHERE inventory_item_id IN (
        SELECT id FROM inventory_items WHERE gr_id = p_doc_id
      );
      SELECT COALESCE(SUM(remaining_liters), 0) INTO v_liters_to_remove FROM inventory_items WHERE gr_id = p_doc_id;
      
      v_result := jsonb_build_object(
        'document_number', v_doc_number,
        'will_delete', jsonb_build_object(
          'goods_received', 1,
          'inventory_items', v_inv_item_count
        ),
        'will_update', jsonb_build_object(
          'purchase_orders', 'Status will be reverted to paid'
        ),
        'will_reverse', jsonb_build_object(
          'tank_level_decrease_liters', v_liters_to_remove
        ),
        'warnings', CASE 
          WHEN v_line_item_count > 0 THEN ARRAY['This GR has been used in ' || v_line_item_count || ' invoice line items. Those invoices will have orphaned line items.']
          ELSE ARRAY[]::text[]
        END
      );
      
    WHEN 'INVOICE' THEN
      SELECT invoice_number INTO v_doc_number FROM invoices WHERE id = p_doc_id;
      SELECT COUNT(*) INTO v_line_item_count FROM invoice_line_items WHERE invoice_id = p_doc_id;
      SELECT COUNT(*) INTO v_dn_count FROM delivery_notes WHERE invoice_id = p_doc_id;
      SELECT COALESCE(SUM(liters_from_item), 0) INTO v_liters_to_restore FROM invoice_line_items WHERE invoice_id = p_doc_id;
      
      v_result := jsonb_build_object(
        'document_number', v_doc_number,
        'will_delete', jsonb_build_object(
          'invoices', 1,
          'invoice_line_items', v_line_item_count
        ),
        'will_update', jsonb_build_object(
          'delivery_notes', v_dn_count || ' delivery notes will be unlinked'
        ),
        'will_reverse', jsonb_build_object(
          'inventory_restored_liters', v_liters_to_restore,
          'tank_level_increase_liters', v_liters_to_restore
        ),
        'warnings', ARRAY[]::text[]
      );
      
    WHEN 'DN' THEN
      SELECT note_number INTO v_doc_number FROM delivery_notes WHERE id = p_doc_id;
      SELECT COUNT(*) INTO v_invoice_count FROM invoices WHERE id = (SELECT invoice_id FROM delivery_notes WHERE id = p_doc_id);
      
      v_result := jsonb_build_object(
        'document_number', v_doc_number,
        'will_delete', jsonb_build_object(
          'delivery_notes', 1
        ),
        'will_update', jsonb_build_object(),
        'will_reverse', jsonb_build_object(),
        'warnings', CASE 
          WHEN v_invoice_count > 0 THEN ARRAY['This delivery note is linked to an invoice. The invoice will NOT be deleted.']
          ELSE ARRAY[]::text[]
        END
      );
      
    ELSE
      RAISE EXCEPTION 'Invalid document type: %', p_doc_type;
  END CASE;
  
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION delete_purchase_requisition(p_pr_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_pos integer := 0;
  v_deleted_grs integer := 0;
  v_deleted_items integer := 0;
  v_liters_removed numeric := 0;
  v_po_ids uuid[];
  v_gr_ids uuid[];
  v_tank_updates jsonb := '{}'::jsonb;
BEGIN
  SELECT ARRAY_AGG(id) INTO v_po_ids FROM purchase_orders WHERE pr_id = p_pr_id;
  
  IF v_po_ids IS NOT NULL THEN
    SELECT ARRAY_AGG(id) INTO v_gr_ids FROM goods_received WHERE po_id = ANY(v_po_ids);
    
    IF v_gr_ids IS NOT NULL THEN
      SELECT COALESCE(SUM(remaining_liters), 0), COUNT(*) 
      INTO v_liters_removed, v_deleted_items
      FROM inventory_items WHERE gr_id = ANY(v_gr_ids);
      
      WITH tank_totals AS (
        SELECT tank_id, SUM(remaining_liters) as total_liters
        FROM inventory_items
        WHERE gr_id = ANY(v_gr_ids)
        GROUP BY tank_id
      )
      UPDATE inventory_tanks t
      SET current_liters = GREATEST(0, t.current_liters - tt.total_liters),
          updated_at = now()
      FROM tank_totals tt
      WHERE t.id = tt.tank_id;
      
      DELETE FROM inventory_items WHERE gr_id = ANY(v_gr_ids);
      
      SELECT COUNT(*) INTO v_deleted_grs FROM goods_received WHERE po_id = ANY(v_po_ids);
      DELETE FROM goods_received WHERE po_id = ANY(v_po_ids);
    END IF;
    
    SELECT COUNT(*) INTO v_deleted_pos FROM purchase_orders WHERE pr_id = p_pr_id;
    DELETE FROM purchase_orders WHERE pr_id = p_pr_id;
  END IF;
  
  DELETE FROM purchase_requisitions WHERE id = p_pr_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'deleted', jsonb_build_object(
      'purchase_requisitions', 1,
      'purchase_orders', v_deleted_pos,
      'goods_received', v_deleted_grs,
      'inventory_items', v_deleted_items
    ),
    'tank_level_decreased_liters', v_liters_removed
  );
END;
$$;

CREATE OR REPLACE FUNCTION delete_purchase_order(p_po_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_grs integer := 0;
  v_deleted_items integer := 0;
  v_liters_removed numeric := 0;
  v_gr_ids uuid[];
BEGIN
  SELECT ARRAY_AGG(id) INTO v_gr_ids FROM goods_received WHERE po_id = p_po_id;
  
  IF v_gr_ids IS NOT NULL THEN
    SELECT COALESCE(SUM(remaining_liters), 0), COUNT(*) 
    INTO v_liters_removed, v_deleted_items
    FROM inventory_items WHERE gr_id = ANY(v_gr_ids);
    
    WITH tank_totals AS (
      SELECT tank_id, SUM(remaining_liters) as total_liters
      FROM inventory_items
      WHERE gr_id = ANY(v_gr_ids)
      GROUP BY tank_id
    )
    UPDATE inventory_tanks t
    SET current_liters = GREATEST(0, t.current_liters - tt.total_liters),
        updated_at = now()
    FROM tank_totals tt
    WHERE t.id = tt.tank_id;
    
    DELETE FROM inventory_items WHERE gr_id = ANY(v_gr_ids);
    
    SELECT COUNT(*) INTO v_deleted_grs FROM goods_received WHERE po_id = p_po_id;
    DELETE FROM goods_received WHERE po_id = p_po_id;
  END IF;
  
  DELETE FROM purchase_orders WHERE id = p_po_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'deleted', jsonb_build_object(
      'purchase_orders', 1,
      'goods_received', v_deleted_grs,
      'inventory_items', v_deleted_items
    ),
    'tank_level_decreased_liters', v_liters_removed
  );
END;
$$;

CREATE OR REPLACE FUNCTION delete_goods_received(p_gr_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_items integer := 0;
  v_liters_removed numeric := 0;
  v_po_id uuid;
BEGIN
  SELECT po_id INTO v_po_id FROM goods_received WHERE id = p_gr_id;
  
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
BEGIN
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

CREATE OR REPLACE FUNCTION delete_delivery_note(p_dn_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice_id uuid;
BEGIN
  SELECT invoice_id INTO v_invoice_id FROM delivery_notes WHERE id = p_dn_id;
  
  DELETE FROM delivery_notes WHERE id = p_dn_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'deleted', jsonb_build_object(
      'delivery_notes', 1
    ),
    'note', CASE 
      WHEN v_invoice_id IS NOT NULL THEN 'Invoice was not deleted, only the delivery note'
      ELSE 'Delivery note deleted'
    END
  );
END;
$$;
