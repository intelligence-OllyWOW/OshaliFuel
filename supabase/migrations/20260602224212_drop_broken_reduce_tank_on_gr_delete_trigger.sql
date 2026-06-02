/*
  # Drop broken reduce_tank_on_gr_delete trigger

  1. Problem
    - A legacy trigger `reduce_tank_on_gr_delete` fires on DELETE of `goods_received`
      and references a `tanks` table that does not exist (the correct table is
      `inventory_tanks`). This causes every GR deletion to fail with:
      "relation 'tanks' does not exist".
    - The trigger logic is also redundant: the `delete_goods_received` RPC already
      decrements `inventory_tanks.current_liters` based on remaining inventory.

  2. Solution
    - Drop the trigger from `goods_received`.
    - Drop the orphaned trigger function `reduce_tank_on_gr_delete`.

  3. Security
    - No data changes; only removes a non-functional trigger that was preventing
      deletions. All tank reconciliation continues to be performed by
      `delete_goods_received()` (SECURITY DEFINER) which is the only supported
      path for GR deletion in the app.
*/

DROP TRIGGER IF EXISTS trigger_reduce_tank_on_gr_delete ON goods_received;
DROP FUNCTION IF EXISTS reduce_tank_on_gr_delete();
