-- =============================================================
-- Gitanic — Development Seed Data
-- Seeds: 001_dev_seed.sql
-- WARNING: Do NOT run in production.
-- =============================================================

-- Dev user (password = "devpassword123" — bcrypt hash)
INSERT INTO users (id, username, password_hash)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'dev-user',
    '$2b$12$l7Od5Cw0D0lQOs37iPUdUOUacQA0Ch1RXQqCwC0gDdmYfk4swL0WO'
)
ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- Dev repository
INSERT INTO repositories (id, name, owner_id)
VALUES (
    '00000000-0000-0000-0000-000000000010',
    'my-site',
    '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (owner_id, name) DO NOTHING;
