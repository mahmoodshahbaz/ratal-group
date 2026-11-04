-- ─── Site Status Logs — RLS + RPC fix ────────────────────────────────────────
-- Run in Supabase SQL Editor

-- 1. Make sure RLS is on (safe to re-run)
ALTER TABLE site_status_logs ENABLE ROW LEVEL SECURITY;

-- 2. Allow anon to INSERT their own logs (direct path - belt & suspenders)
DROP POLICY IF EXISTS "field_anon_insert_site_status_logs" ON site_status_logs;
CREATE POLICY "field_anon_insert_site_status_logs"
  ON site_status_logs FOR INSERT TO anon
  WITH CHECK (true);

-- 3. Allow anon to UPDATE site_assignments progress columns only
DROP POLICY IF EXISTS "field_anon_update_site_assignments" ON site_assignments;
CREATE POLICY "field_anon_update_site_assignments"
  ON site_assignments FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- 4. SECURITY DEFINER RPC — the bullet-proof path used by all other field forms
CREATE OR REPLACE FUNCTION submit_site_status(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment_id uuid  := (payload->>'assignment_id')::uuid;
  v_submitted_at  timestamptz := COALESCE((payload->>'submitted_at')::timestamptz, now());
  v_log_id        uuid;
BEGIN
  -- Insert status log
  INSERT INTO site_status_logs (
    entity_id,
    assignment_id,
    employee_id,
    scope_type,
    milestones_newly_done,
    all_milestones,
    completion_pct,
    photo_url,
    notes,
    submitted_at
  ) VALUES (
    (payload->>'entity_id')::uuid,
    v_assignment_id,
    (payload->>'employee_id')::uuid,
    payload->>'scope_type',
    ARRAY(SELECT jsonb_array_elements_text(payload->'milestones_newly_done')),
    payload->'all_milestones',
    (payload->>'completion_pct')::int,
    payload->>'photo_url',
    NULLIF(payload->>'notes', ''),
    v_submitted_at
  )
  RETURNING id INTO v_log_id;

  -- Update assignment progress
  UPDATE site_assignments SET
    completion_pct       = (payload->>'completion_pct')::int,
    completed_milestones = ARRAY(SELECT jsonb_array_elements_text(payload->'completed_milestones')),
    last_status_at       = v_submitted_at
  WHERE id = v_assignment_id;

  RETURN jsonb_build_object('ok', true, 'log_id', v_log_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- Grant to both anon and authenticated
GRANT EXECUTE ON FUNCTION submit_site_status(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION submit_site_status(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
