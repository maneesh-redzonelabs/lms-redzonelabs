# Lead Management SaaS — Frontend

React 18 + TypeScript + Vite frontend for the multi-tenant Lead Management SaaS product.
It reproduces the visual design and functional flow of the `account_admin_lms_desktop_v_1.4.1.html`
prototype (sidebar + topbar shell, KPI dashboard, data tables, modals, org hierarchy tree) as a
real application wired to the backend REST API.

## Relationship to the backend

This app is a pure client: it has no mock data. All screens call the backend at
`http://localhost:4000/api/v1` (see `src/api/*.ts` for the full contract implemented). In dev,
Vite proxies `/api/*` to `http://localhost:4000`, so no CORS configuration is needed locally.

If the backend is not running, pages will show their loading/error states — this is expected
and is how you can tell the frontend is making real requests rather than faking data.

## Getting started

```bash
cd lms/frontend
npm install
npm run dev
```

The dev server runs on **http://localhost:5174** (fixed port, configured in `vite.config.ts`).

Make sure the backend is running on `http://localhost:4000` for the app to be functional end to
end. Login requires `{ orgId, mobile, password }` against `/auth/login`. Platform Admin uses the
same endpoint with mobile `9811295123` and a separate password.

To point the built app at a different API origin (e.g. in production, where the frontend isn't
served from the same origin/proxy as the backend), copy `.env.example` to `.env` and set
`VITE_API_BASE_URL`.

## Build

```bash
npm run build
```

Runs a TypeScript type-check (`tsc --noEmit`) followed by `vite build`, emitting static assets to
`dist/`.

## Project layout

```
src/
  api/            Typed fetch client + one module per backend resource
  auth/           AuthContext (JWT in memory + refresh token in localStorage), route guards, usePermissions
  components/     AppShell (sidebar/topbar), DataTable, Modal, StepUpModal, Toast, Pagination
  hooks/          useReferenceData (cached lookup lists)
  pages/          auth, dashboard, users, projects, leads, allocations, org-hierarchy, platform
  styles/         global.css — CSS custom properties mirrored from the HTML prototype's palette
```

## Roles

`accountadmin`, `owner`, `manager`, `member` share the organization shell with role-gated nav and
actions (see `src/auth/usePermissions.ts`). `platformadmin` gets a completely separate shell
(Dashboard / Organizations / Reference masters) reachable at `/platform/*`.

## Notable flows

- **Org signup (onboarding)**: `/signup` — public, OTP-based. In dev, OTPs are printed to the
  backend console, not actually sent; the UI says so explicitly.
- **Step-up re-authentication**: required before committing a Won-lead status change or a unit
  reallocation. A password modal obtains a short-lived token sent as `X-Step-Up-Token`.
- **Bulk lead import**: two-step preview (shows per-row validity with CSV template download) then
  commit using the `importToken` returned by the preview call.
- **Platform impersonation**: "Enter as Account Admin" calls `/platform/tenants/{orgId}/impersonate`
  and swaps the current session to the returned one-time token — no query-string tokens.
