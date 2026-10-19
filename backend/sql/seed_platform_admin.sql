-- Seeds the Platform Admin role, home organization and user for the Lead Management SaaS app.
-- Run once against the `lms` schema (same database as lms_saas_schema_v_1.2.sql):
--   psql -h localhost -U postgres -d postgres -f backend/sql/seed_platform_admin.sql
--
-- Platform Admin logs in with mobile + OTP (POST /auth/otp/send, /auth/otp/verify), not a
-- password, so password_hash below is a random bcrypt hash that is never used to authenticate.
SET search_path TO lms, public;

INSERT INTO ref_roles (role_name, description, can_create_users, can_create_projects, view_scope)
VALUES ('platformadmin', 'Platform-wide administrator with cross-tenant access', TRUE, TRUE, 'all')
ON CONFLICT (role_name) DO NOTHING;

INSERT INTO organizations (
    org_name, org_slug, industry, country, timezone,
    subscription_plan, subscription_status, max_users, max_projects,
    onboarding_step, onboarding_complete,
    primary_contact_name, primary_contact_mobile, primary_contact_email, is_active
)
VALUES (
    'RedZone Labs Pvt. Ltd.', 'redzone-labs', 'Other', 'India', 'Asia/Kolkata',
    'enterprise', 'active', 999, 999,
    5, TRUE,
    'Maneesh Sharma', '9811295123', 'maneesh.sharma@redzonelabs.in', TRUE
)
ON CONFLICT (org_slug) DO NOTHING;

INSERT INTO users (org_id, full_name, mobile, email, password_hash, role_id, user_type, is_active)
SELECT o.org_id, 'Maneesh Sharma', '9811295123', 'maneesh.sharma@redzonelabs.in',
       crypt(gen_random_uuid()::text, gen_salt('bf', 12)),
       r.role_id, 'Internal', TRUE
FROM organizations o, ref_roles r
WHERE o.org_slug = 'redzone-labs' AND r.role_name = 'platformadmin'
ON CONFLICT (org_id, mobile) DO NOTHING;
