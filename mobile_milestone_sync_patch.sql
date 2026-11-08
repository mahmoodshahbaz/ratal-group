-- ─────────────────────────────────────────────────────────────────────────────
-- mobile_milestone_sync_patch.sql
-- Patches submit_site_status() to also update site_masters.milestones
-- so the Site Completion desktop page reflects mobile progress.
--
-- Run once in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION submit_site_status(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment_id  uuid        := (payload->>'assignment_id')::uuid;
  v_submitted_at   timestamptz := COALESCE((payload->>'submitted_at')::timestamptz, now());
  v_log_id         uuid;
  v_site_master_id uuid;
  v_today          text        := to_char(now() AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD');
BEGIN
  -- ── 1. Insert status log ──────────────────────────────────────────────────
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

  -- ── 2. Update assignment progress ─────────────────────────────────────────
  UPDATE site_assignments SET
    completion_pct       = (payload->>'completion_pct')::int,
    completed_milestones = ARRAY(SELECT jsonb_array_elements_text(payload->'completed_milestones')),
    last_status_at       = v_submitted_at
  WHERE id = v_assignment_id;

  -- ── 3. Sync site_masters.milestones ───────────────────────────────────────
  -- Get the site_master_id for this assignment
  SELECT site_master_id INTO v_site_master_id
  FROM site_assignments
  WHERE id = v_assignment_id;

  IF v_site_master_id IS NOT NULL THEN
    UPDATE site_masters
    SET milestones = (
      SELECT jsonb_agg(
        CASE
          -- If this milestone name is in the completed list → mark COMPLETED
          WHEN (m->>'name') = ANY(
            ARRAY(SELECT jsonb_array_elements_text(payload->'completed_milestones'))
          )
          THEN jsonb_build_object(
            'name',   m->>'name',
            'status', 'COMPLETED',
            -- Preserve existing date if already set; otherwise use today
            'date',   COALESCE(NULLIF(m->>'date', ''), v_today),
            'notes',  COALESCE(m->>'notes', '')
          )
          -- Otherwise leave as-is (don't regress desktop-set statuses)
          ELSE m
        END
        ORDER BY ordinality
      )
      FROM jsonb_array_elements(
        COALESCE(milestones::jsonb, '[]'::jsonb)
      ) WITH ORDINALITY AS t(m, ordinality)
    )
    WHERE id = v_site_master_id
      -- Only update if milestones column is non-null/non-empty
      AND milestones IS NOT NULL
      AND jsonb_array_length(COALESCE(milestones::jsonb, '[]'::jsonb)) > 0;
  END IF;

  RETURN jsonb_build_object('ok', true, 'log_id', v_log_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- Re-grant permissions
GRANT EXECUTE ON FUNCTION submit_site_status(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION submit_site_status(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
