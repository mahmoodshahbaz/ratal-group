-- ============================================================
-- PATCH: next_po_sequence RPC
-- Returns the next PO sequence number for a given entity + year.
-- Used by PurchaseOrders.jsx to auto-generate PO numbers.
-- Run once in Supabase SQL Editor.
-- ============================================================

CREATE OR REPLACE FUNCTION next_po_sequence(
  p_entity_id UUID,
  p_year      INT
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next INT;
BEGIN
  SELECT COALESCE(MAX(po_seq), 0) + 1
    INTO v_next
    FROM outgoing_pos
   WHERE entity_id = p_entity_id
     AND po_year   = p_year;

  RETURN v_next;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION next_po_sequence(UUID, INT) TO authenticated;
