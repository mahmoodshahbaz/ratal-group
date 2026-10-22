-- ═══════════════════════════════════════════════════════════════════
-- Phase 3 Patch #1 — User Management columns
-- Safe to run multiple times (all IF NOT EXISTS)
-- ═══════════════════════════════════════════════════════════════════

-- Add missing columns to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS email        VARCHAR(200);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_active    BOOLEAN DEFAULT TRUE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS invited_by   UUID REFERENCES auth.users(id);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS invited_at   TIMESTAMPTZ;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS last_sign_in TIMESTAMPTZ;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS avatar_url   VARCHAR(500);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS phone        VARCHAR(30);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS department   VARCHAR(100);

-- Backfill email from auth.users where missing
UPDATE user_profiles up
SET email = au.email
FROM auth.users au
WHERE up.id = au.id AND up.email IS NULL;

-- Index for fast user list queries
CREATE INDEX IF NOT EXISTS idx_profiles_entity   ON user_profiles(entity_code);
CREATE INDEX IF NOT EXISTS idx_profiles_role     ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_active   ON user_profiles(is_active);

-- RLS: users can read all profiles (to show names), but only update their own
-- SUPERADMIN can update anyone via the Edge Function (service_role bypasses RLS)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'profiles_read_all' AND tablename = 'user_profiles'
  ) THEN
    CREATE POLICY "profiles_read_all" ON user_profiles FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'profiles_update_own' AND tablename = 'user_profiles'
  ) THEN
    CREATE POLICY "profiles_update_own" ON user_profiles FOR UPDATE USING (auth.uid() = id);
  END IF;
END $$;
