-- ============================================================
-- ACCSYS HR: Vacation Ticket + Family Status + Home Address
-- Run in Supabase SQL editor
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. VACATION TICKET ELIGIBILITY
--    ticket_cycle: EVERY_YEAR | EVERY_2_YEARS | EVERY_6_MONTHS
--    ticket_last_self_date / ticket_last_family_date: track
--    separate cycles for self vs family tickets
-- ─────────────────────────────────────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS vacation_ticket_eligible  BOOLEAN   DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ticket_cycle              TEXT      DEFAULT 'EVERY_YEAR'
      CHECK (ticket_cycle IN ('EVERY_YEAR','EVERY_2_YEARS','EVERY_6_MONTHS')),
  ADD COLUMN IF NOT EXISTS ticket_last_self_date     DATE,
  ADD COLUMN IF NOT EXISTS ticket_last_family_date   DATE;

COMMENT ON COLUMN employees.vacation_ticket_eligible IS 'Employee is entitled to an annual/periodic air ticket';
COMMENT ON COLUMN employees.ticket_cycle             IS 'How often the self ticket entitlement resets: EVERY_YEAR | EVERY_2_YEARS | EVERY_6_MONTHS';
COMMENT ON COLUMN employees.ticket_last_self_date    IS 'Date employee last used a self ticket — drives next entitlement date';
COMMENT ON COLUMN employees.ticket_last_family_date  IS 'Date employee last used family tickets — drives next family entitlement date (can differ from self cycle)';

-- ─────────────────────────────────────────────────────────────
-- 2. FAMILY STATUS
--    Replaces the simple has_dependents / num_dependents pair
--    with a structured breakdown (spouse, children, other)
--    and per-employee family benefit toggles.
--    Old columns kept for backward compat; auto-sync via trigger.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS family_status             BOOLEAN   DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS family_spouse_count       SMALLINT  DEFAULT 0 CHECK (family_spouse_count BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS family_children_count     SMALLINT  DEFAULT 0 CHECK (family_children_count >= 0),
  ADD COLUMN IF NOT EXISTS family_other_count        SMALLINT  DEFAULT 0 CHECK (family_other_count >= 0),
  ADD COLUMN IF NOT EXISTS family_ticket_eligible    BOOLEAN   DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS family_insurance_eligible BOOLEAN   DEFAULT FALSE;

COMMENT ON COLUMN employees.family_status             IS 'Employee has dependents in KSA under his/her sponsorship';
COMMENT ON COLUMN employees.family_spouse_count       IS '0 or 1 — number of sponsored spouses';
COMMENT ON COLUMN employees.family_children_count     IS 'Number of sponsored children';
COMMENT ON COLUMN employees.family_other_count        IS 'Other sponsored dependents (parents, siblings, etc.)';
COMMENT ON COLUMN employees.family_ticket_eligible    IS 'Family members included in the periodic ticket entitlement';
COMMENT ON COLUMN employees.family_insurance_eligible IS 'Family members covered under the corporate medical insurance policy';

-- Computed helper: total dependents (spouse + children + other)
-- Kept as a virtual expression so num_dependents stays accurate
-- without manual updates.
-- NOTE: If your PG version supports generated columns use this:
-- ADD COLUMN IF NOT EXISTS num_dependents_auto INT GENERATED ALWAYS AS
--   (family_spouse_count + family_children_count + family_other_count) STORED;
-- Otherwise we sync via trigger below.

-- Sync trigger: keep legacy num_dependents & has_dependents in step with family_ columns
CREATE OR REPLACE FUNCTION sync_family_counts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.num_dependents  := COALESCE(NEW.family_spouse_count,0)
                       + COALESCE(NEW.family_children_count,0)
                       + COALESCE(NEW.family_other_count,0);
  NEW.has_dependents  := NEW.family_status AND NEW.num_dependents > 0;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_family_counts ON employees;
CREATE TRIGGER trg_sync_family_counts
  BEFORE INSERT OR UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION sync_family_counts();

-- Back-fill: migrate existing has_dependents / num_dependents into family_status
UPDATE employees
SET
  family_status          = has_dependents,
  family_children_count  = GREATEST(0, num_dependents - 1),  -- assume 1 spouse if has_dependents
  family_spouse_count    = CASE WHEN has_dependents AND num_dependents > 0 THEN 1 ELSE 0 END
WHERE family_status IS FALSE AND has_dependents = TRUE;

-- ─────────────────────────────────────────────────────────────
-- 3. HOME ADDRESS & EMERGENCY CONTACT
-- ─────────────────────────────────────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS home_country              TEXT,
  ADD COLUMN IF NOT EXISTS home_city                 TEXT,
  ADD COLUMN IF NOT EXISTS home_phone                TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name    TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_relation TEXT,  -- Father|Mother|Wife|Brother|Sister|Other
  ADD COLUMN IF NOT EXISTS emergency_contact_phone   TEXT;

COMMENT ON COLUMN employees.home_country               IS 'Employee home country — used for ticket destination and repatriation';
COMMENT ON COLUMN employees.home_city                  IS 'Home city/area — free text, used for repatriation reference';
COMMENT ON COLUMN employees.home_phone                 IS 'Home country phone number (with country code)';
COMMENT ON COLUMN employees.emergency_contact_name     IS 'Name of next-of-kin or emergency contact';
COMMENT ON COLUMN employees.emergency_contact_relation IS 'Relationship: Father | Mother | Wife | Brother | Sister | Other';
COMMENT ON COLUMN employees.emergency_contact_phone    IS 'Emergency contact phone number (with country code)';

-- ─────────────────────────────────────────────────────────────
-- 4. HELPER VIEW: employees with computed ticket_next_due_date
--    Useful for Vacations module to check entitlement at a glance
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_employee_ticket_entitlement AS
SELECT
  e.id,
  e.entity_id,
  e.full_name_en,
  e.employee_number,
  e.employee_category,
  e.vacation_ticket_eligible,
  e.ticket_cycle,
  e.ticket_last_self_date,
  -- Next self-ticket due date
  CASE e.ticket_cycle
    WHEN 'EVERY_6_MONTHS' THEN e.ticket_last_self_date + INTERVAL '6 months'
    WHEN 'EVERY_2_YEARS'  THEN e.ticket_last_self_date + INTERVAL '2 years'
    ELSE                       e.ticket_last_self_date + INTERVAL '1 year'
  END AS ticket_next_self_due,
  -- Is self ticket currently due?
  CASE
    WHEN NOT e.vacation_ticket_eligible THEN FALSE
    WHEN e.ticket_last_self_date IS NULL THEN TRUE  -- never used = always due
    WHEN e.ticket_cycle = 'EVERY_6_MONTHS' AND e.ticket_last_self_date + INTERVAL '6 months' <= CURRENT_DATE THEN TRUE
    WHEN e.ticket_cycle = 'EVERY_2_YEARS'  AND e.ticket_last_self_date + INTERVAL '2 years'  <= CURRENT_DATE THEN TRUE
    WHEN e.ticket_cycle = 'EVERY_YEAR'     AND e.ticket_last_self_date + INTERVAL '1 year'   <= CURRENT_DATE THEN TRUE
    ELSE FALSE
  END AS self_ticket_due_now,
  e.family_status,
  e.family_ticket_eligible,
  e.ticket_last_family_date,
  -- Family ticket always runs on EVERY_YEAR cycle (per policy)
  e.ticket_last_family_date + INTERVAL '1 year' AS ticket_next_family_due,
  CASE
    WHEN NOT (e.family_status AND e.family_ticket_eligible) THEN FALSE
    WHEN e.ticket_last_family_date IS NULL THEN TRUE
    WHEN e.ticket_last_family_date + INTERVAL '1 year' <= CURRENT_DATE THEN TRUE
    ELSE FALSE
  END AS family_ticket_due_now,
  e.family_spouse_count,
  e.family_children_count,
  e.family_other_count,
  (e.family_spouse_count + e.family_children_count + e.family_other_count) AS total_dependents,
  e.home_country,
  e.home_city
FROM employees e
WHERE e.is_active = TRUE;
