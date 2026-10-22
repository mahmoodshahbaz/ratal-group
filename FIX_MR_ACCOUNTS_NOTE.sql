-- Add accounts_note column to money_requests for Send Back reason
ALTER TABLE money_requests ADD COLUMN IF NOT EXISTS accounts_note TEXT;
NOTIFY pgrst, 'reload schema';
