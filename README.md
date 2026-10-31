# GoodPlate — Food Donation Platform

GoodPlate is a demo coordination app connecting food donors with recipient organizations for surplus-food pickups. It is not a food-safety certification or verification system.

## Run locally

Requirements: Node.js 22.5+ (Node 24 recommended), npm, and a Supabase PostgreSQL project.

```sh
npm install
Copy-Item server\.env.example server\.env
# Edit server\.env and set DATABASE_URL and a strong JWT_SECRET.
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The Vite dev server proxies `/api` requests to Express on port 3001. On first launch the server creates the PostgreSQL tables and seeds demo data if the Supabase database is empty. The health endpoint at [http://localhost:3001/api/health](http://localhost:3001/api/health) checks the database connection.

Use the direct PostgreSQL connection URI from Supabase as `DATABASE_URL`. Keep `server/.env` private; never put the URI in client environment variables or commit it. The database password previously shared in chat should be rotated in Supabase before configuring this project. The existing `food_donation.db` file is not imported or modified.

`npm run seed` adds demo data only when the database has no users. `npm run seed:reset` **deletes all application data** in the configured PostgreSQL database before reseeding; use it only on a disposable demo database.

### Demo accounts

Use the quick-fill buttons on the login page, or use:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@demo.com` | `Admin@123` |
| Donor | `donor1@demo.com` through `donor6@demo.com` | `Donor@123` |
| Recipient | `recipient1@demo.com` through `recipient3@demo.com` | `Recipient@123` |

All names, addresses, phone numbers, IDs, organizations, and listings are fictional. Do not enter real personal information.

## Architecture

```text
Browser (React 19, React Router, Tailwind CSS, Vite)
  └── /api (Vite proxy in development)
       └── Express REST API (Node.js)
            ├── JWT in httpOnly cookie + role/profile authorization
            ├── PostgreSQL via node-postgres (pg)
            ├── atomic request reservation/release transactions
            └── 60-second expiration job
                 └── Supabase PostgreSQL
```

The server creates the tables and indexes described in `server/db/schema.sql` at startup. Database access uses parameterized PostgreSQL queries over a connection pool; transactions protect quantity reservation and release.

### ER summary

- **users**: email, password hash, role, JSON profile, suspension state.
- **listings**: donor, food details, quantity total/remaining, pickup and use-by times, attestation, moderation status.
- **requests**: listing, recipient, requested quantity, status, reference code, pickup confirmations.
- **status_history**: append-only listing/request transitions, actor, note, timestamp.
- **notifications**: in-app user notices; no email or SMS delivery.
- **reports**: user-submitted listing/user reports and admin review status.

### Request state machine

```text
pending  --donor accepts (atomic quantity reservation)--> accepted
pending  --donor rejects---------------------------------> rejected
pending  --recipient cancels-----------------------------> cancelled
accepted --recipient or donor cancels (release quantity)-> cancelled
accepted --donor confirms pickup------------------------> completed
accepted --pickup window expires (release quantity)------> missed
pending  --listing/pickup window expires-----------------> expired
```

Listings also use `draft`, `active`, `fully_reserved`, `completed`, `expired`, `removed`, and `cancelled`. Donor cancellation is represented separately from admin moderation (`removed`). Each request transition is stored in `status_history`. Pending requests do not reserve quantity; accepting a request does, inside a PostgreSQL transaction that locks the listing row. Consequently, if pending requests collectively exceed the available quantity, only requests that still fit can be accepted.

## API endpoints

All authenticated endpoints use the JWT cookie set by login/register.

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/api/health` | Public | Health check |
| POST | `/api/auth/register` | Public | Create donor or recipient account |
| POST | `/api/auth/login` | Public | Sign in |
| POST | `/api/auth/logout` | Public | Clear session cookie |
| GET | `/api/auth/me` | Authenticated | Current user |
| GET | `/api/listings` | Public | Browse/filter available listings |
| GET | `/api/listings/my` | Donor | Donor's listings |
| GET | `/api/listings/:id` | Public | Listing detail |
| POST | `/api/listings` | Donor | Create, with required safety attestation |
| PUT | `/api/listings/:id` | Owning donor | Edit listing |
| POST | `/api/listings/:id/cancel` | Owning donor | Cancel listing and open requests |
| POST | `/api/listings/:id/complete` | Owning donor | Close listing |
| DELETE | `/api/listings/:id` | Admin | Remove listing with reason; notify donor |
| GET | `/api/requests` | Authenticated | Role-scoped request history |
| GET | `/api/requests/:id` | Participants/admin | Request details and status timeline |
| POST | `/api/requests` | Active recipient | Request a quantity and confirm pickup window |
| PUT | `/api/requests/:id/accept` | Owning donor | Accept and reserve quantity |
| PUT | `/api/requests/:id/reject` | Owning donor | Reject pending request |
| PUT | `/api/requests/:id/cancel` | Request recipient / listing donor | Cancel an eligible request; release accepted quantity |
| PUT | `/api/requests/:id/pickup` | Owning donor | Confirm pickup and complete request |
| PUT | `/api/requests/:id/confirm` | Request recipient | Optional receipt confirmation |
| GET/PUT | `/api/users`, `/api/users/:id/profile` | Admin / self | List users or view/update own profile |
| PUT | `/api/users/:id/suspend` | Admin | Suspend or restore an account |
| POST | `/api/reports` | Authenticated | Report listing or user |
| GET | `/api/reports` | Admin | Review report queue |
| PUT | `/api/reports/:id/status` | Admin | Update report status |
| GET | `/api/notifications` | Authenticated | List in-app notifications |
| PUT | `/api/notifications/:id/read` | Notification owner | Mark notification read |
| PUT | `/api/notifications/read-all` | Authenticated | Mark all notifications read |

## Assumptions

- A recipient profile is considered active when its required organization/contact/service-area fields are complete and the account is not suspended. This keeps activation straightforward for the demo without an external verification process.
- Requests are pending until the donor accepts them; only acceptance reserves quantity. Conflicting pending requests are resolved by the order donors accept them.
- Pickup completion requires donor confirmation. Recipient receipt confirmation is an optional additional acknowledgement.
- Donor cancellation sets listing status to `cancelled`, distinct from an admin `removed` action.
- Food categories `cooked_meal`, `produce`, and `dairy` are treated as perishable and require a future use-by time later than the pickup window.
- Use only fictional demo profile data. The prototype has no credential verification, legal-compliance guarantee, payments, temperature monitoring, or external notifications.
- The database is hosted PostgreSQL, but the prototype still lacks production operations hardening, monitoring, backups policy, and disaster recovery.

## Five-step demo script

1. Sign in as `donor1@demo.com`, create a listing with a pickup window and use-by time, and check the required safety attestation.
2. Sign in as `recipient1@demo.com`, search for the new listing, request part of its available quantity, and confirm the pickup window.
3. Sign back in as the donor and accept the request. Show the reduced remaining quantity and the request timeline.
4. Mark the pickup complete. Show the reference-code confirmation screen and the completed request on both dashboards.
5. Sign in as admin, action a sample report, and remove an inappropriate listing with a reason; show the moderation status and donor notification.

## Safety notice

The same limitations are available in the app footer, listing detail pages, and [Food Safety and Limitations](docs/SAFETY_AND_LIMITATIONS.md).
#   n e u r o n o v a s - x  
 #   n e u r o n o v a s - x  
 #   n e u r o - n o v a s  
 #   n e u r o - n o v a s  
 