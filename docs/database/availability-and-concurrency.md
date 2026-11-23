# Availability and concurrency

Code: [`backend/src/modules/bookings/availability.service.ts`](../../backend/src/modules/bookings/availability.service.ts)
Tests: [`backend/tests/availability.test.ts`](../../backend/tests/availability.test.ts)

## Principle

**The database is the source of truth for overlap.** The service never does "SELECT to check, then INSERT". It
inserts and lets PostgreSQL's exclusion constraints accept or reject the row, then translates SQLSTATE `23P01` into a
typed error. This is correct under any concurrency, any number of API replicas, and any isolation level.

```sql
-- vehicle: blocks, holds and bookings share ONE table and ONE constraint
EXCLUDE USING gist (vehicle_id WITH =, tstzrange(starts_at, blocked_until, '[)') WITH &&) WHERE (status = 'ACTIVE')
-- driver (covers owner-drivers on several vehicles)
EXCLUDE USING gist (driver_id  WITH =, tstzrange(starts_at, ends_at,       '[)') WITH &&) WHERE (status = 'ACTIVE')
```

When two transactions insert conflicting rows at the same time, the second waits for the first to commit, then fails
with `23P01` (or succeeds if the first rolled back). There is no window in which both can win.

Ranges are half-open `[start, end)`: a row ending at 13:00 and another starting at 13:00 do not overlap.

## Buffer

`tripBufferMinutes` (platform setting, default 60) is added after every trip:

```
blocked_until = ends_at + tripBufferMinutes     (HOLD, BOOKING)
blocked_until = ends_at                          (owner BLOCK — the owner chose the exact range)
```

Example (buffer 60): a trip 10:00–12:00 blocks the vehicle until 13:00. A trip starting 13:00 is allowed; one
starting 12:30 is rejected. Driver assignments use the booking's `[starts_at, ends_at)` without buffer.

The buffer value is captured into `blocked_until` when the row is written, so changing the setting later does not
retroactively move existing rows.

## Flow

```mermaid
sequenceDiagram
    participant C as Customer
    participant API as availability.service
    participant DB as PostgreSQL
    participant P as Payment module (Stage 2B)
    participant S as Scheduler (every minute)

    C->>API: createHold(quotationId)
    API->>DB: BEGIN; SELECT quotation, trip_request FOR UPDATE
    API->>DB: release expired HOLDs on this vehicle
    API->>DB: INSERT booking (PENDING_PAYMENT)
    API->>DB: INSERT vehicle_occupancy HOLD (expires_at = now() + holdDurationMinutes)
    alt 23P01 exclusion violation
        DB-->>API: error → ROLLBACK
        API-->>C: VEHICLE_UNAVAILABLE (409)
    else ok
        API->>DB: quotation ACCEPTED, request CONVERTED, history; COMMIT
        API-->>C: bookingId, holdExpiresAt
    end

    P->>API: confirmHold(bookingId)  (payment succeeded)
    API->>DB: BEGIN; SELECT booking FOR UPDATE
    alt HOLD still ACTIVE
        API->>DB: UPDATE occupancy SET kind = BOOKING, expires_at = NULL
    else hold was released
        API->>DB: INSERT occupancy BOOKING
        Note over API,DB: 23P01 → HOLD_EXPIRED (payment module refunds)
    end
    API->>DB: booking CONFIRMED; overlapping SENT quotations → SUPERSEDED; history; COMMIT

    S->>API: releaseExpiredHolds()
    API->>DB: HOLDs with expires_at <= now(): RELEASED; bookings EXPIRED; quotations/requests EXPIRED
```

### `createHold(quotationId, customerUserId)` — one transaction

1. Lock quotation + trip request (`FOR UPDATE`). Check: exists, belongs to customer, `status = SENT`,
   `expires_at > now()`, vehicle bookable (APPROVED, active, ≥ 1 approved active driver — rule 8).
2. Release expired HOLDs on the same vehicle (so a stale hold never blocks a new customer).
3. Insert `booking` (PENDING_PAYMENT).
4. Insert HOLD occupancy. `23P01` → `VehicleUnavailableError`; the whole transaction rolls back (no booking,
   quotation stays SENT — the customer may retry later if the slot frees up).
5. Quotation → ACCEPTED, trip request → CONVERTED, booking history row.

Overlapping SENT quotations are allowed (rule 13); first hold wins.

### `confirmHold(bookingId, actorUserId?)` — one transaction

- Idempotent: already CONFIRMED → returns `alreadyConfirmed: true`.
- HOLD still ACTIVE (even if its deadline just passed but it was not yet swept) → converted to BOOKING.
- HOLD already RELEASED / booking EXPIRED → tries to insert a fresh BOOKING row. Success revives the
  quotation/request; `23P01` → `HoldExpiredError` and nothing changes (payment module must refund).
- Supersedes every other SENT quotation on the same vehicle whose `[starts_at, ends_at + buffer)` overlaps the
  booking's `[starts_at, blocked_until)`; their trip requests → EXPIRED.

### `releaseExpiredHolds()`

Selects expired ACTIVE HOLDs with `FOR UPDATE … SKIP LOCKED` (a hold being confirmed concurrently is skipped — the
payment wins), releases them, sets bookings EXPIRED and their quotations/requests EXPIRED. Scheduled every minute by
`node-cron` when `ENABLE_SCHEDULER=true` (see `src/jobs/scheduler.ts`); tests call it directly. Safe to run on
several replicas at once thanks to `SKIP LOCKED`.

### `createOwnerBlock` / `releaseOwnerBlock`

Owner-only. Blocks use the same table and constraint, so a block cannot overlap a hold/booking and vice versa.

### `assignDriver(bookingId, driverId, ownerUserId)`

Booking must be CONFIRMED and owned by the caller; trip not yet STARTED. Driver must be linked to the booking's
vehicle (`vehicle_driver`), APPROVED and active. An existing ACTIVE assignment is marked REPLACED, the new one
inserted; `23P01` on `driver_assignment_no_overlap` → `DriverUnavailableError`. Driver availability is **not**
checked at request or hold time (rule 15).

## Locking and deadlocks

Transactions run at READ COMMITTED. Lock order is quotation/trip_request → booking → occupancy. A rare deadlock
(e.g. `confirmHold` superseding a quotation that a concurrent `createHold` has locked) is detected by PostgreSQL;
`runInTransaction` retries the whole transaction up to 3 times on `40P01` / `40001` / Prisma `P2034`.

All "now" comparisons use the database clock (`now()`), never the API server clock.

## Error codes

| Code | HTTP | Thrown by | Meaning |
|---|---|---|---|
| `VEHICLE_UNAVAILABLE` | 409 | createHold, createOwnerBlock | overlapping block/hold/booking (exclusion constraint) |
| `VEHICLE_NOT_BOOKABLE` | 409 | createHold | vehicle not approved/active or no approved driver |
| `QUOTATION_NOT_ACCEPTABLE` | 409 | createHold | quotation not in SENT |
| `QUOTATION_EXPIRED` | 410 | createHold | `expires_at` passed |
| `HOLD_EXPIRED` | 409 | confirmHold | hold released and slot taken — refund required |
| `DRIVER_UNAVAILABLE` | 409 | assignDriver | driver has an overlapping ACTIVE assignment |
| `DRIVER_NOT_ELIGIBLE` | 422 | assignDriver | driver not linked to vehicle, or not approved/active |
| `INVALID_STATE` | 409 | confirmHold, assignDriver | entity in a state that does not allow the action |
| `NOT_FOUND` | 404 | all | |
| `FORBIDDEN` | 403 | all | caller does not own the resource |
| `VALIDATION_ERROR` | 422 | all | malformed ids / dates |

## Settings used

| Key | Default | Used for |
|---|---|---|
| `holdDurationMinutes` | 15 | HOLD `expires_at` |
| `tripBufferMinutes` | 60 | `blocked_until`, supersede overlap |
| `quotationExpiryMinHours` / `MaxHours` | 1 / 72 | quotation send validation (Stage 3) |
| `commissionPercent` | 10 | Stage 2B |
