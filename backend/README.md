# LMS Backend (Multi-Tenant Lead Management SaaS API)

A real, working Fastify + TypeScript + PostgreSQL backend implementing the full Lead
Management SaaS API contract: auth, onboarding, users, projects/inventory, leads, allocations,
dashboard/reports, org hierarchy, reference data, and platform admin.

This is **not** a mock - it connects to a real local PostgreSQL 18 database using the schema
already created in `lms` (22 tables + 8 views, see `../../lms_saas_schema_v_1.2.sql`). The API
runs no DDL; it only reads/writes against the existing schema.

## Prerequisites

- Node.js 18+
- PostgreSQL 18 running locally with the `lms` schema already loaded from
  `lms_saas_schema_v_1.2.sql`.

## Setup & run

```bash
cd lms/backend
npm install
# .env is already present with local dev defaults (gitignored). Edit it if your DB
# credentials differ. See .env.example for what every variable does.
npm run dev      # tsx watch - hot reload for local development
# or
npm run build && npm start   # compiled production-style run
```

The server listens on **http://localhost:4000** (not 5174 - that's reserved for the
frontend dev server, which is a separate project).

Health check: `GET http://localhost:4000/health`

## Encryption key setup (important)

`leads.mobile` and `leads.email` are stored as AES-256 ciphertext (pgcrypto
`pgp_sym_encrypt`/`pgp_sym_decrypt`, via the DB's `fn_encrypt_lead_pii` / `fn_decrypt_lead_pii`
helpers). The key is supplied by the app via the `LMS_PII_ENC_KEY` env var and is passed into
Postgres as the `lms.encryption_key` session GUC on every tenant transaction - it is never
stored in the database or hardcoded in SQL.

**If you loaded the schema's seed data as-is**, its demo leads (Arjun Mehta, Pooja Shah, etc.)
were encrypted using the literal key `CHANGE_ME_AT_DEPLOY_32B_KEY` (see SECTION 13 of the schema
script). The `.env` committed here is set to that same value so the seed data decrypts
correctly out of the box. For anything beyond local dev, generate a real secret, re-encrypt
existing data with it, and never commit it.

## Dev-mode OTP delivery (onboarding)

There is no real SMS/email gateway wired up. `POST /api/v1/onboarding/start` and the
resend-OTP endpoint generate real 6-digit OTPs, bcrypt-hash them into `onboarding_verifications`,
and **print the plaintext OTPs to the server console**, clearly prefixed:

```
[DEV OTP] === Onboarding verification #1 ===
[DEV OTP] Mobile (9123456780) OTP: 411223
[DEV OTP] Email  (test@realty.com) OTP: 116408
[DEV OTP] Expires at: ...
```

Copy the OTPs from the terminal running `npm run dev` to complete `/onboarding/{id}/verify`.
This is exclusively a local-dev convenience and must be replaced with a real SMS/email
provider before any non-local deployment.

## Demo accounts (from the schema's seed data, org_id=1, slug `avira-dream-homes`)

Login is mobile + OTP for every role (see Auth model below) - there is no password at login.
The mobile numbers below are still registered users; sign in with mobile + the mock OTP.

| Role | Mobile |
|---|---|
| accountadmin | 9999999999 |
| owner | 8888888888 |
| manager | 7777777771 |
| manager | 7777777772 |
| member | 6666666661 |

Platform admin (DB-backed, org `RedZone Labs Pvt. Ltd.`, seeded via `backend/sql/seed_platform_admin.sql`):
Maneesh Sharma, mobile `9811295123`.

## Auth model

- **Login**: mobile + OTP for every role, matching the static prototype
  (`account_admin_lms_desktop_v_1.4.1.html`) exactly - `POST /auth/otp/send { mobile }` then
  `POST /auth/otp/verify { mobile, otp }`. There is no password at login any more. The OTP is a
  fixed demo/mock code (`123456`, shown in the UI exactly like the prototype's "Demo verification
  code" box), not a randomly generated/delivered one - `/otp/send` only checks the mobile is a
  registered active user so the UI can show a friendly error before moving to the OTP screen.
- **Access token**: JWT, HS256 (chosen over RS256 for local-dev simplicity - a single shared
  secret is fine since there's one server instance; swap to RS256 + JWKS if you need multiple
  verifying services), 15 min TTL, claims `{sub, org_id, role, view_scope, user_type, jti}`.
- **Refresh token**: an opaque random token. The server never stores the raw token - it stores
  `user_sessions.session_id = sha256(refreshToken)` (the schema's `session_id` column is already
  documented as "a CSPRNG token; never sequential", so this reuses it directly rather than
  adding a new column). `jti` in the access token is also this hash, so logout/session-revocation
  lines up with the session row. Refresh rotates the session by updating `session_id` to a new
  hash and extending `expires_at`.
- **Step-up tokens**: a separate re-authentication step (unrelated to login) still used to unlock
  `/units/{id}/reallocate` and editing a lead currently in `Won` status - `POST /auth/step-up`
  checks the caller's `users.password_hash` (the seed passwords in the table above, e.g.
  `Admin@123`) and issues a single-use, 5-minute JWT sent back via the `X-Step-Up-Token` header.
- **Platform admin**: a real `users` row (role `platformadmin`) under its own home organization
  (`RedZone Labs Pvt. Ltd.`, seeded by `backend/sql/seed_platform_admin.sql`), logging in the same
  mobile+OTP way as every other role. On success it gets a normal JWT + `user_sessions` row like
  any other login. `requireTenant` explicitly rejects `role: 'platformadmin'` even though it has a
  real `org_id`, so it still can't act as a tenant member of its home org - it must use
  impersonation like any other tenant.
- **Impersonation**: `POST /platform/tenants/{orgId}/impersonate` issues a single-use, 5-minute
  JWT scoped to that org's accountadmin user. The frontend exchanges it via
  `POST /auth/exchange-impersonation` for a normal access/refresh token pair (a real
  `user_sessions` row is created). There is no query-param-based auto-login anywhere.

## Tenant isolation

Every tenant-scoped DB call runs inside `withTenantTransaction(orgId, fn)`
(`src/db/pool.ts`), which does `SET LOCAL lms.current_org_id = '<orgId>'` and
`SET LOCAL lms.encryption_key = '<key>'` before any query, so Postgres RLS policies
(`pol_*_org`) apply. Every query additionally filters explicitly by `org_id` in application
code - RLS is defense-in-depth, not a substitute, per the spec.

Public/pre-auth routes (org resolution, login, onboarding) and the platform-admin routes use
`withTransaction(fn)`, which sets no tenant GUC - platform admin routes intentionally bypass
per-tenant scoping since platform admin is cross-tenant by design.

## Rate limiting

A small in-memory sliding-window limiter (`src/middleware/rateLimit.ts`) - no Redis. State is
per-process and resets on restart; fine for a single-instance local dev server, not for
multi-instance production.

- 10/min/IP on `/auth/login` and the onboarding OTP endpoints
- 100/min/user (or per-IP if unauthenticated) on all other authenticated endpoints
  (global `onRequest` hook in `src/app.ts`)
- 5/hour/user on the bulk-import endpoints

## Error envelope

Every error response is `{ error: { code, message, details, requestId } }`. List endpoints
return `{ data: [...], meta: { page, pageSize, total } }`.

## Notable deviations from the spec (and why)

1. **Onboarding password**: the spec's onboarding payload never collects a password for the
   bootstrap accountadmin user, yet `users.password_hash` is `NOT NULL`. `POST
   /onboarding/{id}/verify` therefore additionally requires a `password` field (min 8 chars) in
   its request body, used to set the new accountadmin's initial password.
2. **Bulk-import fuzzy matching** is implemented as case-insensitive exact/substring matching
   against the org's actual projects and the global ref tables, not a full edit-distance fuzzy
   matcher - simple and adequate for the prototype's needs, documented here as a simplification.
3. **Audit log masking** uses a straightforward regex over 10-digit numbers and email-shaped
   strings inside the JSONB `old_values`/`new_values`, per the spec's "simple regex-based
   masking is fine" allowance.
4. **Project view scoping**: Projects & Inventory endpoints are restricted to
   accountadmin/owner for both read and write, exactly as the spec's section header states;
   manager/member never call these endpoints directly (they see project names only through the
   leads list, which already joins the project table).

## Project layout

```
src/
  config/env.ts            - env var loading/validation
  db/pool.ts                - pg Pool, withTenantTransaction / withTransaction helpers
  middleware/auth.ts         - JWT issuing/verification, step-up & impersonation tokens, role guards
  middleware/rateLimit.ts   - in-memory sliding window limiter
  services/                 - audit log writer, lead-visibility wrapper, allocation logic, unit-number generator
  utils/                     - errors, pagination, validation, tokens, slug
  modules/<resource>/       - one Fastify plugin per resource (routes.ts [+ schemas.ts])
  app.ts                    - Fastify app wiring (helmet, cors, multipart, error handler, route registration)
  server.ts                  - entrypoint
```

## Smoke-tested flows (verified against the real local DB during development)

- `GET /ref/lead-statuses` returns all 11 statuses
- Onboarding: `start` -> console `[DEV OTP]` -> `verify` -> new org + accountadmin created
- Login with both the newly onboarded org and the seed demo `avira-dream-homes` org
- `GET /leads` decrypts `mobile`/`email` correctly via `vw_leads_full`
- Duplicate-mobile rejection on `POST /leads`
- `POST /projects` with `initialInventory` batch-generates units
- Role-hierarchy validation on `POST /users` (member must report to an active manager, etc.)
- Step-up flow: editing a `Won` lead is blocked without `X-Step-Up-Token`, allowed with it
- Terminal-status transition guard (`422 TERMINAL_STATUS_TRANSITION` without `confirm:true`)
- Allocation: `/allocations/{leadId}/eligible-units`, double-allocation rejection
- Platform admin login, `/platform/tenants`, impersonate -> `/auth/exchange-impersonation`,
  cross-tenant `/audit-logs`
- Bulk import: `preview` (CSV parse, fuzzy ref matching, invalid-row detection) -> `commit`
  (valid rows inserted, invalid rows skipped)
