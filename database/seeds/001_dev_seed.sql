-- =============================================================
-- Gitanic — Development Seed Data
-- Seeds: 001_dev_seed.sql
-- WARNING: Do NOT run in production.
-- =============================================================

-- Dev user (password = "devpassword123" — bcrypt hash)
INSERT INTO users (id, username, password_hash, email)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'AakashVelusamy',
    '$2b$12$/QAUUygec0H.CSadvWIhZuDUhJceIQiFbpxIAN7/WSx4u5AluTrs2',
    '23pt01@psgtech.ac.in'
)
ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, email = EXCLUDED.email;

-- Dev repository
INSERT INTO repositories (id, name, owner_id)
VALUES (
    '00000000-0000-0000-0000-000000000010',
    'my-site',
    '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (owner_id, name) DO NOTHING;
