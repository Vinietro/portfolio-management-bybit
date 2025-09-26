-- Update existing schema to add unique constraints
-- Run these commands in your Neon database SQL Editor

-- First, check if tables exist and what data is in them
SELECT * FROM information_schema.tables WHERE table_name IN ('portfolios', 'credentials');

-- Add unique constraints to existing tables
ALTER TABLE portfolios ADD CONSTRAINT portfolios_user_id_unique UNIQUE (user_id);
ALTER TABLE credentials ADD CONSTRAINT credentials_user_id_unique UNIQUE (user_id);

-- If you need to remove duplicates first (optional - only if you have duplicates):
-- Delete duplicates from portfolios (keeping the latest version)
-- DELETE FROM portfolios WHERE id NOT IN (
--   SELECT DISTINCT ON (user_id) id FROM portfolios ORDER BY user_id, updated_at DESC
-- );

-- Delete duplicates from credentials (keeping the latest version)
-- DELETE FROM credentials WHERE id NOT IN (
--   SELECT DISTINCT ON (user_id) id FROM credentials ORDER BY user_id, updated_at DESC
-- );
