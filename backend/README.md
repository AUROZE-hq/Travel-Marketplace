# Backend — Sri Lanka Travel Marketplace API

Express + TypeScript modular monolith, PostgreSQL 16 via Prisma 6. REST under `/api/v1`.

```
src/
  config/           env validation (Zod), Prisma client
  modules/          domain modules (new code goes here)
    bookings/       availability.service.ts — holds, bookings, blocks, driver assignment
    platform/       settings.service.ts — admin-configurable platform settings
  shared/           DomainError types, Postgres error helpers, transaction helper
  jobs/             node-cron scheduler (opt-in via ENABLE_SCHEDULER)
  controllers/ routes/ services/ middlewares/   health endpoints (pre-module layout)
prisma/
  schema.prisma     models and enums
  migrations/       SQL migrations — includes raw-SQL constraints (see below)
  seed.ts           idempotent development seed
tests/              Vitest integration tests against a real PostgreSQL test database
```

Design docs: [`docs/database/`](../docs/database/) (ERD, state machines, availability & concurrency) and
[`docs/api/openapi.yaml`](../docs/api/openapi.yaml).

## Environment

Copy `.env.example` to `.env`. Variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | development database |
| `DATABASE_URL_TEST` | **separate** test database (name must contain `test`; it is wiped on every test run) |
| `FRONTEND_URL`, `PORT`, `NODE_ENV` | API server |
| `ENABLE_SCHEDULER` | `true` to release expired payment holds every minute |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` | admin user created by the seed (skipped if unset) |
| `SEED_SAMPLE_PASSWORD` | optional password for sample accounts; unset → sample accounts cannot log in |

If port 5432 is already taken on your machine, start Postgres on another port and update both URLs:
`POSTGRES_PORT=5433 npm run db:up`.

## Database constraints not represented in schema.prisma — never use `prisma db push` against shared databases

The migration `prisma/migrations/*_availability_constraints/migration.sql` creates integrity rules that Prisma's
schema language cannot express. They exist **only** in migrations:

| Object | Rule |
|---|---|
| extension `btree_gist` | needed for the exclusion constraints |
| `vehicle_occupancy_no_overlap` (EXCLUDE) | no overlapping ACTIVE block/hold/booking per vehicle |
| `driver_assignment_no_overlap` (EXCLUDE) | no overlapping ACTIVE assignments per driver (incl. owner-drivers) |
| `driver_assignment_one_active_per_booking` (EXCLUDE) | ≤ 1 ACTIVE driver per booking |
| `vehicle_driver_one_vehicle_per_driver` (partial UNIQUE) | a normal driver links to one vehicle; owner-drivers exempt |
| `quotation_expires_before_start`, `quotation_valid_range`, `vehicle_occupancy_*`, `document_one_subject`, … (CHECK) | sanity rules |

Consequences:

- **Never run `prisma db push`** against any database other than a throwaway one — it builds tables from
  `schema.prisma` only and silently omits every constraint above, which breaks double-booking protection.
- Always use `prisma migrate dev` (local) / `prisma migrate deploy` (CI, staging, production).
- Prisma does not detect these objects as drift: after applying the migration, `prisma migrate dev` reports
  "Already in sync" and `prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel prisma/schema.prisma`
  produces an empty migration (verified with Prisma 6.19.3). Re-verify after upgrading Prisma.
- When adding a constraint of this kind, put it in a hand-edited migration (`prisma migrate dev --create-only`) and
  add it to the table above.

## Common commands

Run from `backend/` (or prefix with `npm run <script> --workspace backend` from the repo root).

```bash
npm run db:migrate          # prisma migrate dev — apply/create migrations locally
npm run db:migrate:deploy   # prisma migrate deploy — CI / production
npm run db:reset            # prisma migrate reset — DROPS the dev database, re-applies all migrations, runs the seed
npm run db:seed             # idempotent seed (safe to run repeatedly)
npm run prisma:validate
npm test                    # Vitest; rebuilds DATABASE_URL_TEST from zero (migrate reset) then runs all tests
npm run typecheck           # src + seed + tests
npm run lint
npm run lint:openapi        # Redocly lint of docs/api/openapi.yaml
```

## Seed

`prisma/seed.ts` upserts on natural keys, so running it twice creates no duplicates. It writes:

- vehicle categories: Car, SUV, Van, Mini Bus, Bus, Luxury, Three-Wheeler
- **sample** areas (`is_sample = true`): Colombo, Gampaha, Kandy, Galle
- platform settings defaults (existing values are never overwritten)
- admin user from `SEED_ADMIN_*` env vars
- **sample** marketplace (`@example.com`): an individual owner-driver with 2 vehicles, a business owner with 2 vehicles
  and 3 drivers, 2 customers — all approved

The seed's password hashing format (scrypt) is supported with transparent upgrade to Argon2id upon login.

## Authentication and Identity (Stage 3A)

Full authentication architecture documentation: [`docs/auth/authentication-architecture.md`](../docs/auth/authentication-architecture.md).

Endpoints implemented under `/api/v1`:
- `POST /auth/register` — public customer registration with atomic User, UserRole, CustomerProfile, and AuthSession creation
- `POST /auth/login` — authentication, timing attack protection, Argon2id verification, session creation
- `POST /auth/refresh` — refresh token rotation with session-family reuse detection
- `POST /auth/logout` — authenticated session revocation with ownership check
- `POST /auth/password-reset/request` — email enumeration-safe password reset token generation
- `POST /auth/password-reset/confirm` — single-use reset confirmation, atomic password update, and multi-device session revocation
- `GET /users/me` — current authenticated user details and profiles
- `PATCH /users/me` — user profile update (fullName, phone)

## Tests

Vitest integration tests run against a real PostgreSQL database (no mocks), because the behaviour under test lives
in database constraints and database transactions. `tests/globalSetup.ts` runs `prisma migrate reset --force` against `DATABASE_URL_TEST`
(creating the database if needed), and each test truncates all tables. Test files run sequentially; the concurrency
tests fire parallel transactions within a file.

## Error handling

Domain errors extend `DomainError` (`src/shared/errors/DomainError.ts`) and carry a stable `code` and `httpStatus`
for the API error envelope `{ "error": { "code", "message", "details" } }`. The Express `errorHandler` formats domain errors, Zod validation errors (422), and general errors consistently with this structure.
