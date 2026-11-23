import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { getPlatformSettings } from '../platform/settings.service.js';
import { isExclusionViolation } from '../../shared/db/pgErrors.js';
import { runInTransaction, type Tx } from '../../shared/db/transaction.js';
import {
  ForbiddenError,
  InvalidStateError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/DomainError.js';
import {
  DriverNotEligibleError,
  DriverUnavailableError,
  HoldExpiredError,
  QuotationExpiredError,
  QuotationNotAcceptableError,
  VehicleNotBookableError,
  VehicleUnavailableError,
} from './availability.errors.js';

/**
 * Availability & concurrency engine (core logic only — no HTTP).
 *
 * The PostgreSQL exclusion constraints are the source of truth for overlap:
 *   vehicle_occupancy_no_overlap  → VehicleUnavailableError / HoldExpiredError
 *   driver_assignment_no_overlap  → DriverUnavailableError
 * We never "check then insert"; we insert and translate SQLSTATE 23P01.
 * All time comparisons use the database clock (now()).
 *
 * See docs/database/availability-and-concurrency.md.
 */

const VEHICLE_OVERLAP_CONSTRAINT = 'vehicle_occupancy_no_overlap';
const DRIVER_OVERLAP_CONSTRAINT = 'driver_assignment_no_overlap';

const uuid = z.string().uuid();

function assertUuid(value: string, field: string): void {
  if (!uuid.safeParse(value).success) throw new ValidationError(`${field} must be a UUID`, { field });
}

function assertDate(value: Date, field: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new ValidationError(`${field} must be a valid date`, { field });
  }
}

export interface HoldResult {
  bookingId: string;
  holdId: string;
  vehicleId: string;
  startsAt: Date;
  endsAt: Date;
  blockedUntil: Date;
  holdExpiresAt: Date;
}

export interface ConfirmResult {
  bookingId: string;
  occupancyId: string;
  alreadyConfirmed: boolean;
  /** true when the hold had been released and a new occupancy row was inserted. */
  reacquired: boolean;
  supersededQuotationIds: string[];
}

export interface ReleaseExpiredHoldsResult {
  releasedHoldIds: string[];
  expiredBookingIds: string[];
}

export interface AssignDriverResult {
  assignmentId: string;
  replacedAssignmentId: string | null;
  unchanged: boolean;
}

export type AvailabilityService = ReturnType<typeof createAvailabilityService>;

export function createAvailabilityService(prisma: PrismaClient) {
  // ---------------------------------------------------------------------------
  // Internal helpers (all run inside a caller-provided transaction)
  // ---------------------------------------------------------------------------

  async function isVehicleBookable(tx: Tx, vehicleId: string): Promise<boolean> {
    const [row] = await tx.$queryRaw<{ ok: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM vehicle v
        WHERE v.id = ${vehicleId}::uuid
          AND v.approval_status = 'APPROVED'
          AND v.is_active
          AND EXISTS (
            SELECT 1
            FROM vehicle_driver vd
            JOIN driver_profile d ON d.id = vd.driver_id
            WHERE vd.vehicle_id = v.id
              AND d.verification_status = 'APPROVED'
              AND d.is_active
          )
      ) AS ok`;
    return row?.ok === true;
  }

  /**
   * Releases ACTIVE HOLD rows whose expires_at has passed and expires their
   * PENDING_PAYMENT bookings (+ quotation and trip request). Rows locked by a
   * concurrent confirmHold are skipped (SKIP LOCKED) — that payment wins.
   */
  async function expireHolds(tx: Tx, vehicleId: string | null): Promise<ReleaseExpiredHoldsResult> {
    const rows = await tx.$queryRaw<
      { occupancyId: string; bookingId: string; bookingStatus: string; quotationId: string }[]
    >`
      SELECT o.id AS "occupancyId", b.id AS "bookingId", b.status::text AS "bookingStatus",
             b.quotation_id AS "quotationId"
      FROM vehicle_occupancy o
      JOIN booking b ON b.id = o.booking_id
      WHERE o.kind = 'HOLD'
        AND o.status = 'ACTIVE'
        AND o.expires_at <= now()
        AND (${vehicleId}::uuid IS NULL OR o.vehicle_id = ${vehicleId}::uuid)
      ORDER BY b.id
      FOR UPDATE OF b, o SKIP LOCKED`;

    const result: ReleaseExpiredHoldsResult = { releasedHoldIds: [], expiredBookingIds: [] };
    for (const row of rows) {
      await tx.$executeRaw`
        UPDATE vehicle_occupancy
        SET status = 'RELEASED', released_at = now(), updated_at = now()
        WHERE id = ${row.occupancyId}::uuid`;
      result.releasedHoldIds.push(row.occupancyId);

      if (row.bookingStatus !== 'PENDING_PAYMENT') continue;

      await tx.booking.update({
        where: { id: row.bookingId },
        data: { status: 'EXPIRED', expiredAt: new Date() },
      });
      await tx.bookingStatusHistory.create({
        data: {
          bookingId: row.bookingId,
          fromStatus: 'PENDING_PAYMENT',
          toStatus: 'EXPIRED',
          reason: 'Payment hold expired',
        },
      });

      const quotation = await tx.quotation.updateMany({
        where: { id: row.quotationId, status: 'ACCEPTED' },
        data: { status: 'EXPIRED' },
      });
      if (quotation.count > 0) {
        await tx.quotationStatusHistory.create({
          data: {
            quotationId: row.quotationId,
            fromStatus: 'ACCEPTED',
            toStatus: 'EXPIRED',
            reason: 'Payment hold expired',
          },
        });
        const q = await tx.quotation.findUniqueOrThrow({
          where: { id: row.quotationId },
          select: { tripRequestId: true },
        });
        const request = await tx.tripRequest.updateMany({
          where: { id: q.tripRequestId, status: 'CONVERTED' },
          data: { status: 'EXPIRED' },
        });
        if (request.count > 0) {
          await tx.tripRequestStatusHistory.create({
            data: {
              tripRequestId: q.tripRequestId,
              fromStatus: 'CONVERTED',
              toStatus: 'EXPIRED',
              reason: 'Payment hold expired',
            },
          });
        }
      }
      result.expiredBookingIds.push(row.bookingId);
    }
    return result;
  }

  /** Marks other SENT quotations whose would-be occupancy overlaps as SUPERSEDED. */
  async function supersedeOverlappingQuotations(
    tx: Tx,
    args: {
      vehicleId: string;
      exceptQuotationId: string;
      startsAt: Date;
      blockedUntil: Date;
      bufferMinutes: number;
      actorUserId: string | null;
    },
  ): Promise<string[]> {
    const superseded = await tx.$queryRaw<{ id: string; tripRequestId: string }[]>`
      UPDATE quotation q
      SET status = 'SUPERSEDED', updated_at = now()
      WHERE q.vehicle_id = ${args.vehicleId}::uuid
        AND q.status = 'SENT'
        AND q.id <> ${args.exceptQuotationId}::uuid
        AND tstzrange(q.starts_at, q.ends_at + make_interval(mins => ${args.bufferMinutes}::int), '[)')
            && tstzrange(${args.startsAt}::timestamptz, ${args.blockedUntil}::timestamptz, '[)')
      RETURNING q.id, q.trip_request_id AS "tripRequestId"`;

    for (const q of superseded) {
      await tx.quotationStatusHistory.create({
        data: {
          quotationId: q.id,
          fromStatus: 'SENT',
          toStatus: 'SUPERSEDED',
          actorUserId: args.actorUserId,
          reason: 'Vehicle booked by another customer for an overlapping time',
        },
      });
      const request = await tx.tripRequest.updateMany({
        where: { id: q.tripRequestId, status: 'QUOTED' },
        data: { status: 'EXPIRED' },
      });
      if (request.count > 0) {
        await tx.tripRequestStatusHistory.create({
          data: {
            tripRequestId: q.tripRequestId,
            fromStatus: 'QUOTED',
            toStatus: 'EXPIRED',
            actorUserId: args.actorUserId,
            reason: 'Quotation superseded',
          },
        });
      }
    }
    return superseded.map((q) => q.id);
  }

  async function audit(
    tx: Tx,
    entry: {
      actorUserId: string | null;
      action: string;
      entityType: string;
      entityId: string;
      metadata?: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await tx.auditLog.create({ data: entry });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Customer accepts a quotation: creates a payment HOLD on the vehicle and a
   * PENDING_PAYMENT booking, atomically. Throws VehicleUnavailableError if an
   * overlapping block/hold/booking exists (enforced by the DB constraint).
   */
  async function createHold(quotationId: string, customerUserId: string): Promise<HoldResult> {
    assertUuid(quotationId, 'quotationId');
    assertUuid(customerUserId, 'customerUserId');

    return runInTransaction(prisma, async (tx) => {
      const settings = await getPlatformSettings(tx);

      // 1. Lock the quotation and its trip request.
      const [q] = await tx.$queryRaw<
        {
          id: string;
          status: string;
          isExpired: boolean;
          tripRequestId: string;
          requestStatus: string;
          vehicleId: string;
          ownerId: string;
          customerId: string;
          customerUserId: string;
          startsAt: Date;
          endsAt: Date;
          totalAmount: Prisma.Decimal;
          currency: string;
        }[]
      >`
        SELECT q.id, q.status::text AS status, (q.expires_at <= now()) AS "isExpired",
               q.trip_request_id AS "tripRequestId", tr.status::text AS "requestStatus",
               q.vehicle_id AS "vehicleId", tr.owner_id AS "ownerId",
               tr.customer_id AS "customerId", cp.user_id AS "customerUserId",
               q.starts_at AS "startsAt", q.ends_at AS "endsAt",
               q.total_amount AS "totalAmount", q.currency
        FROM quotation q
        JOIN trip_request tr ON tr.id = q.trip_request_id
        JOIN customer_profile cp ON cp.id = tr.customer_id
        WHERE q.id = ${quotationId}::uuid
        FOR UPDATE OF q, tr`;

      if (!q) throw new NotFoundError('Quotation', quotationId);
      if (q.customerUserId !== customerUserId) throw new ForbiddenError();
      if (q.status !== 'SENT') throw new QuotationNotAcceptableError(q.status);
      if (q.isExpired) throw new QuotationExpiredError();
      if (!(await isVehicleBookable(tx, q.vehicleId))) {
        throw new VehicleNotBookableError({ vehicleId: q.vehicleId });
      }

      // 2. Release expired holds on this vehicle so they don't block us.
      await expireHolds(tx, q.vehicleId);

      // 3. Booking (needed first: the HOLD row references it).
      const booking = await tx.booking.create({
        data: {
          quotationId: q.id,
          customerId: q.customerId,
          vehicleId: q.vehicleId,
          ownerId: q.ownerId,
          startsAt: q.startsAt,
          endsAt: q.endsAt,
          totalAmount: q.totalAmount,
          currency: q.currency,
          status: 'PENDING_PAYMENT',
        },
      });

      // 4. HOLD occupancy — the exclusion constraint decides who wins.
      let hold: { id: string; blockedUntil: Date; expiresAt: Date } | undefined;
      try {
        [hold] = await tx.$queryRaw<{ id: string; blockedUntil: Date; expiresAt: Date }[]>`
          INSERT INTO vehicle_occupancy
            (vehicle_id, kind, status, starts_at, ends_at, blocked_until, expires_at,
             booking_id, reason, created_by_user_id)
          VALUES
            (${q.vehicleId}::uuid, 'HOLD', 'ACTIVE', ${q.startsAt}::timestamptz, ${q.endsAt}::timestamptz,
             ${q.endsAt}::timestamptz + make_interval(mins => ${settings.tripBufferMinutes}::int),
             now() + make_interval(mins => ${settings.holdDurationMinutes}::int),
             ${booking.id}::uuid, 'Payment hold', ${customerUserId}::uuid)
          RETURNING id, blocked_until AS "blockedUntil", expires_at AS "expiresAt"`;
      } catch (error) {
        if (isExclusionViolation(error, VEHICLE_OVERLAP_CONSTRAINT)) {
          throw new VehicleUnavailableError({ vehicleId: q.vehicleId, quotationId: q.id });
        }
        throw error;
      }
      if (!hold) throw new Error('HOLD insert returned no row');

      // 5. Lifecycle transitions + history.
      await tx.quotation.update({
        where: { id: q.id },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      });
      await tx.quotationStatusHistory.create({
        data: { quotationId: q.id, fromStatus: 'SENT', toStatus: 'ACCEPTED', actorUserId: customerUserId },
      });
      await tx.tripRequest.update({ where: { id: q.tripRequestId }, data: { status: 'CONVERTED' } });
      await tx.tripRequestStatusHistory.create({
        data: {
          tripRequestId: q.tripRequestId,
          fromStatus: q.requestStatus as Prisma.TripRequestStatusHistoryCreateInput['toStatus'],
          toStatus: 'CONVERTED',
          actorUserId: customerUserId,
        },
      });
      await tx.bookingStatusHistory.create({
        data: { bookingId: booking.id, fromStatus: null, toStatus: 'PENDING_PAYMENT', actorUserId: customerUserId },
      });

      return {
        bookingId: booking.id,
        holdId: hold.id,
        vehicleId: q.vehicleId,
        startsAt: q.startsAt,
        endsAt: q.endsAt,
        blockedUntil: hold.blockedUntil,
        holdExpiresAt: hold.expiresAt,
      };
    });
  }

  /**
   * Called by the payment module once payment succeeds. Converts the HOLD into
   * a BOOKING occupancy, confirms the booking and supersedes overlapping SENT
   * quotations. If the hold was already released, tries to re-acquire the slot;
   * if that fails throws HoldExpiredError (the payment module must refund).
   * Idempotent for an already CONFIRMED booking.
   */
  async function confirmHold(bookingId: string, actorUserId: string | null = null): Promise<ConfirmResult> {
    assertUuid(bookingId, 'bookingId');
    if (actorUserId !== null) assertUuid(actorUserId, 'actorUserId');

    return runInTransaction(prisma, async (tx) => {
      const settings = await getPlatformSettings(tx);

      const [b] = await tx.$queryRaw<
        { id: string; status: string; vehicleId: string; quotationId: string; startsAt: Date; endsAt: Date }[]
      >`
        SELECT id, status::text AS status, vehicle_id AS "vehicleId", quotation_id AS "quotationId",
               starts_at AS "startsAt", ends_at AS "endsAt"
        FROM booking WHERE id = ${bookingId}::uuid
        FOR UPDATE`;
      if (!b) throw new NotFoundError('Booking', bookingId);

      if (b.status === 'CONFIRMED') {
        const occ = await tx.vehicleOccupancy.findFirst({
          where: { bookingId: b.id, kind: 'BOOKING', status: 'ACTIVE' },
          select: { id: true },
        });
        return {
          bookingId: b.id,
          occupancyId: occ?.id ?? '',
          alreadyConfirmed: true,
          reacquired: false,
          supersededQuotationIds: [],
        };
      }
      if (b.status !== 'PENDING_PAYMENT' && b.status !== 'EXPIRED') {
        throw new InvalidStateError(`Booking cannot be confirmed in status ${b.status}`, { status: b.status });
      }

      // Convert the still-ACTIVE hold (even if its deadline just passed — the
      // row was not released, so nobody else could have taken the slot).
      const [converted] = await tx.$queryRaw<{ id: string; blockedUntil: Date }[]>`
        UPDATE vehicle_occupancy
        SET kind = 'BOOKING', expires_at = NULL, updated_at = now()
        WHERE booking_id = ${b.id}::uuid AND kind = 'HOLD' AND status = 'ACTIVE'
        RETURNING id, blocked_until AS "blockedUntil"`;

      let occupancy = converted;
      let reacquired = false;
      if (!occupancy) {
        try {
          [occupancy] = await tx.$queryRaw<{ id: string; blockedUntil: Date }[]>`
            INSERT INTO vehicle_occupancy
              (vehicle_id, kind, status, starts_at, ends_at, blocked_until, booking_id, reason, created_by_user_id)
            VALUES
              (${b.vehicleId}::uuid, 'BOOKING', 'ACTIVE', ${b.startsAt}::timestamptz, ${b.endsAt}::timestamptz,
               ${b.endsAt}::timestamptz + make_interval(mins => ${settings.tripBufferMinutes}::int),
               ${b.id}::uuid, 'Confirmed booking (hold re-acquired after expiry)', ${actorUserId}::uuid)
            RETURNING id, blocked_until AS "blockedUntil"`;
          reacquired = true;
        } catch (error) {
          if (isExclusionViolation(error, VEHICLE_OVERLAP_CONSTRAINT)) {
            throw new HoldExpiredError({ bookingId: b.id, vehicleId: b.vehicleId });
          }
          throw error;
        }
      }
      if (!occupancy) throw new Error('BOOKING occupancy was not created');

      // A late payment on an EXPIRED booking revives its quotation and request.
      if (b.status === 'EXPIRED') {
        const q = await tx.quotation.findUniqueOrThrow({
          where: { id: b.quotationId },
          select: { status: true, tripRequestId: true },
        });
        if (q.status === 'EXPIRED') {
          await tx.quotation.update({ where: { id: b.quotationId }, data: { status: 'ACCEPTED' } });
          await tx.quotationStatusHistory.create({
            data: {
              quotationId: b.quotationId,
              fromStatus: 'EXPIRED',
              toStatus: 'ACCEPTED',
              actorUserId,
              reason: 'Late payment received; vehicle still available',
            },
          });
        }
        const request = await tx.tripRequest.updateMany({
          where: { id: q.tripRequestId, status: 'EXPIRED' },
          data: { status: 'CONVERTED' },
        });
        if (request.count > 0) {
          await tx.tripRequestStatusHistory.create({
            data: {
              tripRequestId: q.tripRequestId,
              fromStatus: 'EXPIRED',
              toStatus: 'CONVERTED',
              actorUserId,
              reason: 'Late payment received; vehicle still available',
            },
          });
        }
      }

      await tx.booking.update({
        where: { id: b.id },
        data: { status: 'CONFIRMED', confirmedAt: new Date() },
      });
      await tx.bookingStatusHistory.create({
        data: {
          bookingId: b.id,
          fromStatus: b.status as 'PENDING_PAYMENT' | 'EXPIRED',
          toStatus: 'CONFIRMED',
          actorUserId,
          reason: reacquired ? 'Payment confirmed after hold expiry; slot re-acquired' : 'Payment confirmed',
        },
      });

      const supersededQuotationIds = await supersedeOverlappingQuotations(tx, {
        vehicleId: b.vehicleId,
        exceptQuotationId: b.quotationId,
        startsAt: b.startsAt,
        blockedUntil: occupancy.blockedUntil,
        bufferMinutes: settings.tripBufferMinutes,
        actorUserId,
      });

      return {
        bookingId: b.id,
        occupancyId: occupancy.id,
        alreadyConfirmed: false,
        reacquired,
        supersededQuotationIds,
      };
    });
  }

  /** Releases all expired holds and expires their bookings. Run every minute. */
  async function releaseExpiredHolds(): Promise<ReleaseExpiredHoldsResult> {
    return runInTransaction(prisma, (tx) => expireHolds(tx, null));
  }

  async function assertVehicleOwnedBy(tx: Tx, vehicleId: string, ownerUserId: string): Promise<void> {
    const [v] = await tx.$queryRaw<{ ownerUserId: string }[]>`
      SELECT op.user_id AS "ownerUserId"
      FROM vehicle v JOIN owner_profile op ON op.id = v.owner_id
      WHERE v.id = ${vehicleId}::uuid`;
    if (!v) throw new NotFoundError('Vehicle', vehicleId);
    if (v.ownerUserId !== ownerUserId) throw new ForbiddenError();
  }

  /** Owner blocks a vehicle time range (maintenance, personal use). No buffer is added. */
  async function createOwnerBlock(
    vehicleId: string,
    startsAt: Date,
    endsAt: Date,
    reason: string | null,
    ownerUserId: string,
  ): Promise<{ blockId: string }> {
    assertUuid(vehicleId, 'vehicleId');
    assertUuid(ownerUserId, 'ownerUserId');
    assertDate(startsAt, 'startsAt');
    assertDate(endsAt, 'endsAt');
    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new ValidationError('endsAt must be after startsAt', { field: 'endsAt' });
    }

    return runInTransaction(prisma, async (tx) => {
      await assertVehicleOwnedBy(tx, vehicleId, ownerUserId);
      await expireHolds(tx, vehicleId);

      let block: { id: string } | undefined;
      try {
        [block] = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO vehicle_occupancy
            (vehicle_id, kind, status, starts_at, ends_at, blocked_until, reason, created_by_user_id)
          VALUES
            (${vehicleId}::uuid, 'BLOCK', 'ACTIVE', ${startsAt}::timestamptz, ${endsAt}::timestamptz,
             ${endsAt}::timestamptz, ${reason}, ${ownerUserId}::uuid)
          RETURNING id`;
      } catch (error) {
        if (isExclusionViolation(error, VEHICLE_OVERLAP_CONSTRAINT)) {
          throw new VehicleUnavailableError({ vehicleId });
        }
        throw error;
      }
      if (!block) throw new Error('BLOCK insert returned no row');

      await audit(tx, {
        actorUserId: ownerUserId,
        action: 'vehicle.block.created',
        entityType: 'VehicleOccupancy',
        entityId: block.id,
        metadata: { vehicleId, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), reason },
      });
      return { blockId: block.id };
    });
  }

  /** Owner removes one of their blocks. Idempotent if already released. */
  async function releaseOwnerBlock(blockId: string, ownerUserId: string): Promise<void> {
    assertUuid(blockId, 'blockId');
    assertUuid(ownerUserId, 'ownerUserId');

    await runInTransaction(prisma, async (tx) => {
      const [row] = await tx.$queryRaw<{ kind: string; status: string; ownerUserId: string }[]>`
        SELECT o.kind::text AS kind, o.status::text AS status, op.user_id AS "ownerUserId"
        FROM vehicle_occupancy o
        JOIN vehicle v ON v.id = o.vehicle_id
        JOIN owner_profile op ON op.id = v.owner_id
        WHERE o.id = ${blockId}::uuid
        FOR UPDATE OF o`;
      if (!row || row.kind !== 'BLOCK') throw new NotFoundError('Vehicle block', blockId);
      if (row.ownerUserId !== ownerUserId) throw new ForbiddenError();
      if (row.status === 'RELEASED') return;

      await tx.vehicleOccupancy.update({
        where: { id: blockId },
        data: { status: 'RELEASED', releasedAt: new Date() },
      });
      await audit(tx, {
        actorUserId: ownerUserId,
        action: 'vehicle.block.released',
        entityType: 'VehicleOccupancy',
        entityId: blockId,
      });
    });
  }

  /**
   * Owner assigns (or replaces) the driver of a CONFIRMED booking. The driver
   * must be linked to the booking's vehicle, APPROVED and active. Overlap with
   * the driver's other trips is enforced by the DB (DriverUnavailableError).
   */
  async function assignDriver(
    bookingId: string,
    driverId: string,
    ownerUserId: string,
  ): Promise<AssignDriverResult> {
    assertUuid(bookingId, 'bookingId');
    assertUuid(driverId, 'driverId');
    assertUuid(ownerUserId, 'ownerUserId');

    return runInTransaction(prisma, async (tx) => {
      const [b] = await tx.$queryRaw<
        {
          id: string;
          status: string;
          tripStatus: string | null;
          vehicleId: string;
          startsAt: Date;
          endsAt: Date;
          ownerUserId: string;
        }[]
      >`
        SELECT b.id, b.status::text AS status, b.trip_status::text AS "tripStatus",
               b.vehicle_id AS "vehicleId", b.starts_at AS "startsAt", b.ends_at AS "endsAt",
               op.user_id AS "ownerUserId"
        FROM booking b JOIN owner_profile op ON op.id = b.owner_id
        WHERE b.id = ${bookingId}::uuid
        FOR UPDATE OF b`;
      if (!b) throw new NotFoundError('Booking', bookingId);
      if (b.ownerUserId !== ownerUserId) throw new ForbiddenError();
      if (b.status !== 'CONFIRMED') {
        throw new InvalidStateError(`A driver can only be assigned to a CONFIRMED booking (status ${b.status})`);
      }
      if (b.tripStatus === 'STARTED' || b.tripStatus === 'COMPLETED') {
        throw new InvalidStateError(`Driver cannot be changed once the trip is ${b.tripStatus}`);
      }

      const link = await tx.vehicleDriver.findUnique({
        where: { vehicleId_driverId: { vehicleId: b.vehicleId, driverId } },
        select: { driver: { select: { verificationStatus: true, isActive: true } } },
      });
      if (!link) throw new DriverNotEligibleError({ reason: 'NOT_LINKED_TO_VEHICLE', driverId });
      if (link.driver.verificationStatus !== 'APPROVED' || !link.driver.isActive) {
        throw new DriverNotEligibleError({ reason: 'DRIVER_NOT_APPROVED', driverId });
      }

      const current = await tx.driverAssignment.findFirst({
        where: { bookingId: b.id, status: 'ACTIVE' },
        select: { id: true, driverId: true },
      });
      if (current?.driverId === driverId) {
        return { assignmentId: current.id, replacedAssignmentId: null, unchanged: true };
      }
      if (current) {
        await tx.driverAssignment.update({
          where: { id: current.id },
          data: { status: 'REPLACED', endedAt: new Date() },
        });
      }

      let assignment: { id: string } | undefined;
      try {
        [assignment] = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO driver_assignment (booking_id, driver_id, starts_at, ends_at, status, assigned_by_user_id)
          VALUES (${b.id}::uuid, ${driverId}::uuid, ${b.startsAt}::timestamptz, ${b.endsAt}::timestamptz,
                  'ACTIVE', ${ownerUserId}::uuid)
          RETURNING id`;
      } catch (error) {
        if (isExclusionViolation(error, DRIVER_OVERLAP_CONSTRAINT)) {
          throw new DriverUnavailableError({ driverId, bookingId: b.id });
        }
        throw error;
      }
      if (!assignment) throw new Error('Driver assignment insert returned no row');

      await tx.booking.update({ where: { id: b.id }, data: { tripStatus: 'ASSIGNED' } });
      await tx.tripEvent.create({
        data: {
          bookingId: b.id,
          fromStatus: b.tripStatus as Prisma.TripEventCreateInput['fromStatus'],
          toStatus: 'ASSIGNED',
          actorUserId: ownerUserId,
          note: current ? 'Driver replaced' : 'Driver assigned',
        },
      });
      await audit(tx, {
        actorUserId: ownerUserId,
        action: current ? 'booking.driver.replaced' : 'booking.driver.assigned',
        entityType: 'Booking',
        entityId: b.id,
        metadata: { driverId, replacedAssignmentId: current?.id ?? null },
      });

      return { assignmentId: assignment.id, replacedAssignmentId: current?.id ?? null, unchanged: false };
    });
  }

  return {
    createHold,
    confirmHold,
    releaseExpiredHolds,
    createOwnerBlock,
    releaseOwnerBlock,
    assignDriver,
  };
}
