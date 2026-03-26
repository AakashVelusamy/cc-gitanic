-- =============================================================
-- Gitanic — Realtime Configuration
-- Migration: 003_realtime_setup.sql
-- =============================================================

-- 1. Set Replica Identity to FULL for the logs table
-- This ensures that the 'old' record performance is sent for UPDATE/DELETE,
-- and all columns are included in the Realtime stream.
ALTER TABLE logs REPLICA IDENTITY FULL;

-- 2. Add the logs table to the 'supabase_realtime' publication.
-- This enables the Supabase Realtime server to broadcast changes for this table.
-- Note: 'supabase_realtime' publication is created by default in Supabase.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE logs;
    END IF;
END $$;
