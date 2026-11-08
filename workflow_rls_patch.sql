-- ─────────────────────────────────────────────────────────────
-- workflow_rls_patch.sql
-- Adds INSERT / UPDATE / DELETE policies for workflow_templates
-- and workflow_template_milestones so the app can save workflows.
-- Run once in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────

-- workflow_templates
DROP POLICY IF EXISTS "entity_insert_workflow_templates"  ON workflow_templates;
DROP POLICY IF EXISTS "entity_update_workflow_templates"  ON workflow_templates;
DROP POLICY IF EXISTS "entity_delete_workflow_templates"  ON workflow_templates;

CREATE POLICY "entity_insert_workflow_templates" ON workflow_templates
  FOR INSERT WITH CHECK (true);

CREATE POLICY "entity_update_workflow_templates" ON workflow_templates
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "entity_delete_workflow_templates" ON workflow_templates
  FOR DELETE USING (true);

-- workflow_template_milestones
DROP POLICY IF EXISTS "entity_insert_template_milestones" ON workflow_template_milestones;
DROP POLICY IF EXISTS "entity_update_template_milestones" ON workflow_template_milestones;
DROP POLICY IF EXISTS "entity_delete_template_milestones" ON workflow_template_milestones;

CREATE POLICY "entity_insert_template_milestones" ON workflow_template_milestones
  FOR INSERT WITH CHECK (true);

CREATE POLICY "entity_update_template_milestones" ON workflow_template_milestones
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "entity_delete_template_milestones" ON workflow_template_milestones
  FOR DELETE USING (true);
