# LMS — Lead Management SaaS

Full-stack rebuild of the Avira Dream Homes / RedZone Labs Lead Management prototype:
multi-tenant Node.js/Fastify API + React/Vite SPA, backed by PostgreSQL (schema `lms`).

## Structure

- `backend/` — Node.js + TypeScript + Fastify API (port **4000**). See `backend/README.md`.
- `frontend/` — React + TypeScript + Vite SPA (port **5174**). See `frontend/README.md`.

## Prerequisites

- Node.js 20+ and npm
- A local PostgreSQL instance with the `lms` schema already created via
  `../lms_saas_schema_v_1.2.sql` (run from the parent `Lead-Management-Prototype` folder).

## Running locally

```bash
# Terminal 1 — backend
cd backend
cp .env.example .env   # fill in your local Postgres credentials and secrets
npm install
npm run dev             # http://localhost:4000

# Terminal 2 — frontend
cd frontend
npm install
npm run dev             # http://localhost:5174
```

Then open http://localhost:5174 in a browser.

## Notes

- **Dev-mode OTP**: onboarding/login OTPs are not sent via SMS/email in this build —
  they are printed to the backend server console, clearly prefixed `[DEV OTP]`.
- **Lead PII encryption**: `leads.mobile` and `leads.email` are AES-256 encrypted at rest
  (see the backend README and the database schema doc for details). The API still accepts
  and returns these fields as plain strings — encryption/decryption is transparent at the
  data-access layer.
- Rate limiting and session bookkeeping are implemented in-process (no Redis dependency),
  suitable for local/single-instance use.
