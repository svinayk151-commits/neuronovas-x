# Food Donation Platform — implementation plan

## Initial inventory

- The server already has an Express API, PostgreSQL schema, JWT cookie auth, role middleware, listing/request/report/notification routes, and an expiry job.
- The frontend is still the default Vite starter; the requested user journeys and pages are not implemented.
- Demo seed data and a root `npm run dev` script exist, but documentation is still the Vite template.
- Runtime is Node 22.5+ and the server connects to Supabase PostgreSQL through `pg`.

## Task list

- [ ] Complete and verify backend validation, profile eligibility, atomic quantity reservation/release, request transitions/history, report handling, and expiration.
- [ ] Build the responsive React application: landing, auth, browse/detail, donor create/edit/dashboard, recipient dashboard, request timeline/pickup confirmation, notifications, admin, and safety pages.
- [ ] Ensure repeatable demo seed data, demo account quick-fill, safety disclaimers, setup/architecture/API/state-machine documentation, and five-step demo script.
- [ ] Run the app, exercise API and browser flows, fix regressions, and capture a walkthrough screenshot.

## Implementation order

1. Make database/API transitions reliable and enforce role, profile, safety, and quantity rules at the server boundary.
2. Replace the starter UI with the requested functional routes, forms, dashboards, and reusable presentation.
3. Align demo seed and documentation with the implemented behavior.
4. Build and run the app; validate API edge cases and the key browser workflows.

## Scope decisions

- Use PostgreSQL hosted by Supabase, configured through the server-only `DATABASE_URL` environment variable.
- Keep demo data fictional; the existing local SQLite file is not automatically imported into Supabase.
- Defer optional phase-two features until required flows are complete.
