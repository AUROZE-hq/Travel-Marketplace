import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createAvailabilityService } from '../src/modules/bookings/availability.service.js';
import {
  DriverNotEligibleError,
  DriverUnavailableError,
  HoldExpiredError,
  QuotationNotAcceptableError,
  VehicleNotBookableError,
  VehicleUnavailableError,
} from '../src/modules/bookings/availability.errors.js';
import {
  at,
  baseTime,
  createBookableVehicle,
  createCategory,
  createConfirmedBooking,
  createCustomer,
  createDriver,
  createOwner,
  createQuotation,
  createVehicle,
  linkDriver,
  prisma,
  resetDatabase,
} from './helpers/fixtures.js';

const service = createAvailabilityService(prisma);

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

async function activeOccupancies(vehicleId: string) {
  return prisma.vehicleOccupancy.findMany({ where: { vehicleId, status: 'ACTIVE' } });
}

/** Force a hold's payment deadline into the past (simulates time passing). */
async function expireHoldNow(bookingId: string) {
  await prisma.$executeRaw`
    UPDATE vehicle_occupancy SET expires_at = now() - interval '1 minute'
    WHERE booking_id = ${bookingId}::uuid AND kind = 'HOLD' AND status = 'ACTIVE'`;
}

describe('createHold', () => {
  it('1. concurrent overlapping holds on the same vehicle: exactly one succeeds', async () => {
    const { vehicle } = await createBookableVehicle();
    const base = baseTime();
    const a = await createCustomer('A');
    const b = await createCustomer('B');
    const qa = await createQuotation({ vehicle, customerProfileId: a.profile.id, startsAt: at(base, 10), endsAt: at(base, 14) });
    const qb = await createQuotation({ vehicle, customerProfileId: b.profile.id, startsAt: at(base, 12), endsAt: at(base, 16) });

    const results = await Promise.allSettled([
      service.createHold(qa.id, a.user.id),
      service.createHold(qb.id, b.user.id),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(VehicleUnavailableError);
    expect(rejected[0]!.reason.code).toBe('VEHICLE_UNAVAILABLE');

    // Loser's transaction fully rolled back.
    expect(await activeOccupancies(vehicle.id)).toHaveLength(1);
    expect(await prisma.booking.count()).toBe(1);
    const statuses = (await prisma.quotation.findMany({ select: { status: true } })).map((q) => q.status).sort();
    expect(statuses).toEqual(['ACCEPTED', 'SENT']);
  });

  it('1b. eight concurrent holds for the same slot: exactly one succeeds', async () => {
    const { vehicle } = await createBookableVehicle();
    const base = baseTime();
    const attempts = await Promise.all(
      Array.from({ length: 8 }, async (_, i) => {
        const c = await createCustomer(`C${i}`);
        const q = await createQuotation({ vehicle, customerProfileId: c.profile.id, startsAt: at(base, 10), endsAt: at(base, 12) });
        return { q, c };
      }),
    );
    const results = await Promise.allSettled(attempts.map(({ q, c }) => service.createHold(q.id, c.user.id)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')) {
      expect(r.reason).toBeInstanceOf(VehicleUnavailableError);
    }
    expect(await activeOccupancies(vehicle.id)).toHaveLength(1);
  });

  it('2. non-overlapping holds both succeed, back-to-back respects the 60-minute buffer', async () => {
    const { vehicle } = await createBookableVehicle();
    const base = baseTime();
    const c = await createCustomer();
    // 10:00–12:00 → blocked until 13:00 (buffer 60 min).
    const q1 = await createQuotation({ vehicle, customerProfileId: c.profile.id, startsAt: at(base, 10), endsAt: at(base, 12) });
    // Starts exactly when the buffer ends → allowed (half-open range).
    const q2 = await createQuotation({ vehicle, customerProfileId: c.profile.id, startsAt: at(base, 13), endsAt: at(base, 15) });
    // Starts inside q1's buffer (12:30) → rejected.
    const q3 = await createQuotation({ vehicle, customerProfileId: c.profile.id, startsAt: at(base, 12.5), endsAt: at(base, 12.75) });

    const h1 = await service.createHold(q1.id, c.user.id);
    const h2 = await service.createHold(q2.id, c.user.id);
    expect(h1.blockedUntil.toISOString()).toBe(at(base, 13).toISOString());
    expect(h2.startsAt.toISOString()).toBe(at(base, 13).toISOString());
    await expect(service.createHold(q3.id, c.user.id)).rejects.toBeInstanceOf(VehicleUnavailableError);
    expect(await activeOccupancies(vehicle.id)).toHaveLength(2);
  });

  it('3. an owner block prevents a hold over the same period', async () => {
    const { vehicle, owner } = await createBookableVehicle();
    const base = baseTime();
    const c = await createCustomer();
    const { blockId } = await service.createOwnerBlock(vehicle.id, at(base, 8), at(base, 18), 'Maintenance', owner.user.id);
    const q = await createQuotation({ vehicle, customerProfileId: c.profile.id, startsAt: at(base, 10), endsAt: at(base, 12) });

    await expect(service.createHold(q.id, c.user.id)).rejects.toBeInstanceOf(VehicleUnavailableError);
    expect((await prisma.quotation.findUniqueOrThrow({ where: { id: q.id } })).status).toBe('SENT');

    // Releasing the block frees the slot.
    await service.releaseOwnerBlock(blockId, owner.user.id);
    await expect(service.createHold(q.id, c.user.id)).resolves.toMatchObject({ vehicleId: vehicle.id });
  });

  it('3b. an owner cannot block over an existing hold, and cannot block another owner\'s vehicle', async () => {
    const { vehicle, owner } = await createBookableVehicle();
    const other = await createOwner();
    const base = baseTime();
    const c = await createCustomer();
    const q = await createQuotation({ vehicle, customerProfileId: c.profile.id, startsAt: at(base, 10), endsAt: at(base, 12) });
    await service.createHold(q.id, c.user.id);
    await expect(
      service.createOwnerBlock(vehicle.id, at(base, 11), at(base, 20), null, owner.user.id),
    ).rejects.toBeInstanceOf(VehicleUnavailableError);
    await expect(
      service.createOwnerBlock(vehicle.id, at(base, 30), at(base, 40), null, other.user.id),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects holds on vehicles that are not bookable (rule 8) and on non-SENT quotations', async () => {
    const category = await createCategory();
    const owner = await createOwner();
    const vehicle = await createVehicle(owner.profile.id, category.id); // approved, but no driver
    const c = await createCustomer();
    const base = baseTime();
    const q = await createQuotation({ vehicle, customerProfileId: c.profile.id, startsAt: at(base, 10), endsAt: at(base, 12) });
    await expect(service.createHold(q.id, c.user.id)).rejects.toBeInstanceOf(VehicleNotBookableError);

    const driver = await createDriver(owner.profile.id);
    await linkDriver(vehicle, driver);
    await service.createHold(q.id, c.user.id);
    await expect(service.createHold(q.id, c.user.id)).rejects.toBeInstanceOf(QuotationNotAcceptableError);
  });

  it('rejects a hold by a customer who does not own the trip request', async () => {
    const { vehicle } = await createBookableVehicle();
    const c = await createCustomer();
    const stranger = await createCustomer();
    const base = baseTime();
    const q = await createQuotation({ vehicle, customerProfileId: c.profile.id, startsAt: at(base, 10), endsAt: at(base, 12) });
    await expect(service.createHold(q.id, stranger.user.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('releaseExpiredHolds', () => {
  it('4. releases an expired hold, expires its booking, and the slot can be held again', async () => {
    const { vehicle } = await createBookableVehicle();
    const base = baseTime();
    const a = await createCustomer('A');
    const b = await createCustomer('B');
    const qa = await createQuotation({ vehicle, customerProfileId: a.profile.id, startsAt: at(base, 10), endsAt: at(base, 14) });
    const qb = await createQuotation({ vehicle, customerProfileId: b.profile.id, startsAt: at(base, 11), endsAt: at(base, 13) });

    const hold = await service.createHold(qa.id, a.user.id);
    await expect(service.createHold(qb.id, b.user.id)).rejects.toBeInstanceOf(VehicleUnavailableError);

    await expireHoldNow(hold.bookingId);
    const released = await service.releaseExpiredHolds();
    expect(released.releasedHoldIds).toEqual([hold.holdId]);
    expect(released.expiredBookingIds).toEqual([hold.bookingId]);

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: hold.bookingId } });
    expect(booking.status).toBe('EXPIRED');
    expect((await prisma.quotation.findUniqueOrThrow({ where: { id: qa.id } })).status).toBe('EXPIRED');
    expect((await prisma.tripRequest.findUniqueOrThrow({ where: { id: qa.tripRequestId } })).status).toBe('EXPIRED');
    expect(
      await prisma.bookingStatusHistory.findMany({ where: { bookingId: hold.bookingId }, orderBy: { createdAt: 'asc' } }),
    ).toMatchObject([
      { fromStatus: null, toStatus: 'PENDING_PAYMENT' },
      { fromStatus: 'PENDING_PAYMENT', toStatus: 'EXPIRED' },
    ]);

    await expect(service.createHold(qb.id, b.user.id)).resolves.toMatchObject({ vehicleId: vehicle.id });
    // Nothing left to release.
    expect(await service.releaseExpiredHolds()).toEqual({ releasedHoldIds: [], expiredBookingIds: [] });
  });

  it('4b. createHold itself releases an expired (not yet swept) hold on the vehicle', async () => {
    const { vehicle } = await createBookableVehicle();
    const base = baseTime();
    const a = await createCustomer('A');
    const b = await createCustomer('B');
    const qa = await createQuotation({ vehicle, customerProfileId: a.profile.id, startsAt: at(base, 10), endsAt: at(base, 14) });
    const qb = await createQuotation({ vehicle, customerProfileId: b.profile.id, startsAt: at(base, 11), endsAt: at(base, 13) });
    const hold = await service.createHold(qa.id, a.user.id);
    await expireHoldNow(hold.bookingId);
    await expect(service.createHold(qb.id, b.user.id)).resolves.toMatchObject({ vehicleId: vehicle.id });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: hold.bookingId } })).status).toBe('EXPIRED');
  });
});

describe('confirmHold', () => {
  it('5. confirms the booking and supersedes other overlapping SENT quotations only', async () => {
    const { vehicle } = await createBookableVehicle();
    const other = await createBookableVehicle();
    const base = baseTime();
    const c = await createCustomer();
    const q1 = await createQuotation({ vehicle, customerProfileId: c.profile.id, startsAt: at(base, 10), endsAt: at(base, 14) });
    const overlapping = await createQuotation({ vehicle, customerProfileId: c.profile.id, startsAt: at(base, 12), endsAt: at(base, 16) });
    const inBuffer = await createQuotation({ vehicle, customerProfileId: c.profile.id, startsAt: at(base, 14.5), endsAt: at(base, 16) });
    const later = await createQuotation({ vehicle, customerProfileId: c.profile.id, startsAt: at(base, 20), endsAt: at(base, 22) });
    const otherVehicle = await createQuotation({ vehicle: other.vehicle, customerProfileId: c.profile.id, startsAt: at(base, 10), endsAt: at(base, 14) });

    const hold = await service.createHold(q1.id, c.user.id);
    const result = await service.confirmHold(hold.bookingId);

    expect(result.alreadyConfirmed).toBe(false);
    expect(result.reacquired).toBe(false);
    expect(result.supersededQuotationIds.sort()).toEqual([overlapping.id, inBuffer.id].sort());

    const status = async (id: string) => (await prisma.quotation.findUniqueOrThrow({ where: { id } })).status;
    expect(await status(q1.id)).toBe('ACCEPTED');
    expect(await status(overlapping.id)).toBe('SUPERSEDED');
    expect(await status(inBuffer.id)).toBe('SUPERSEDED');
    expect(await status(later.id)).toBe('SENT');
    expect(await status(otherVehicle.id)).toBe('SENT');
    expect((await prisma.tripRequest.findUniqueOrThrow({ where: { id: overlapping.tripRequestId } })).status).toBe('EXPIRED');
    expect(await prisma.quotationStatusHistory.count({ where: { quotationId: overlapping.id, toStatus: 'SUPERSEDED' } })).toBe(1);

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: hold.bookingId } });
    expect(booking.status).toBe('CONFIRMED');
    expect(booking.confirmedAt).not.toBeNull();
    const occ = await activeOccupancies(vehicle.id);
    expect(occ).toHaveLength(1);
    expect(occ[0]).toMatchObject({ kind: 'BOOKING', expiresAt: null, bookingId: hold.bookingId });

    // Idempotent.
    await expect(service.confirmHold(hold.bookingId)).resolves.toMatchObject({ alreadyConfirmed: true });
  });

  it('late payment: re-acquires a released slot if still free, else throws HoldExpiredError', async () => {
    const { vehicle } = await createBookableVehicle();
    const base = baseTime();
    const a = await createCustomer('A');
    const b = await createCustomer('B');
    const c = await createCustomer('C');
    const qa = await createQuotation({ vehicle, customerProfileId: a.profile.id, startsAt: at(base, 10), endsAt: at(base, 12) });
    const qb = await createQuotation({ vehicle, customerProfileId: b.profile.id, startsAt: at(base, 30), endsAt: at(base, 32) });
    const qc = await createQuotation({ vehicle, customerProfileId: c.profile.id, startsAt: at(base, 30), endsAt: at(base, 31) });

    // A: hold expires and is released; nobody else takes the slot → late payment succeeds.
    const ha = await service.createHold(qa.id, a.user.id);
    await expireHoldNow(ha.bookingId);
    await service.releaseExpiredHolds();
    await expect(service.confirmHold(ha.bookingId)).resolves.toMatchObject({ reacquired: true });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: ha.bookingId } })).status).toBe('CONFIRMED');
    expect((await prisma.quotation.findUniqueOrThrow({ where: { id: qa.id } })).status).toBe('ACCEPTED');

    // B: hold expires, C takes the slot → B's late payment fails.
    const hb = await service.createHold(qb.id, b.user.id);
    await expireHoldNow(hb.bookingId);
    await service.createHold(qc.id, c.user.id);
    await expect(service.confirmHold(hb.bookingId)).rejects.toBeInstanceOf(HoldExpiredError);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: hb.bookingId } })).status).toBe('EXPIRED');
  });
});

describe('assignDriver', () => {
  it('6. an owner-driver linked to 2 vehicles cannot be assigned to two overlapping bookings', async () => {
    const category = await createCategory();
    const owner = await createOwner('INDIVIDUAL');
    const car = await createVehicle(owner.profile.id, category.id);
    const van = await createVehicle(owner.profile.id, category.id);
    const ownerDriver = await createDriver(owner.profile.id, { userId: owner.user.id, isOwnerDriver: true });
    const suv = await createVehicle(owner.profile.id, category.id);
    await linkDriver(car, ownerDriver);
    await linkDriver(van, ownerDriver);
    await linkDriver(suv, ownerDriver);
    const base = baseTime();

    const b1 = await createConfirmedBooking(service, { vehicle: car, startsAt: at(base, 10), endsAt: at(base, 14) });
    const b2 = await createConfirmedBooking(service, { vehicle: van, startsAt: at(base, 12), endsAt: at(base, 16) });
    const b3 = await createConfirmedBooking(service, { vehicle: suv, startsAt: at(base, 14), endsAt: at(base, 15) });

    await expect(service.assignDriver(b1, ownerDriver.id, owner.user.id)).resolves.toMatchObject({ unchanged: false });
    await expect(service.assignDriver(b2, ownerDriver.id, owner.user.id)).rejects.toBeInstanceOf(DriverUnavailableError);
    // Back-to-back (14:00 start after a 14:00 end) is fine for the driver.
    await expect(service.assignDriver(b3, ownerDriver.id, owner.user.id)).resolves.toMatchObject({ unchanged: false });

    expect(await prisma.driverAssignment.count({ where: { driverId: ownerDriver.id, status: 'ACTIVE' } })).toBe(2);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b2 } })).tripStatus).toBeNull();
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b1 } })).tripStatus).toBe('ASSIGNED');
  });

  it('replaces an existing assignment and rejects drivers not linked to the vehicle', async () => {
    const { vehicle, owner, driver } = await createBookableVehicle();
    const second = await createDriver(owner.profile.id);
    await linkDriver(vehicle, second);
    const unlinked = await createDriver(owner.profile.id);
    const base = baseTime();
    const bookingId = await createConfirmedBooking(service, { vehicle, startsAt: at(base, 10), endsAt: at(base, 12) });

    const first = await service.assignDriver(bookingId, driver.id, owner.user.id);
    await expect(service.assignDriver(bookingId, driver.id, owner.user.id)).resolves.toMatchObject({ unchanged: true });
    const replaced = await service.assignDriver(bookingId, second.id, owner.user.id);
    expect(replaced.replacedAssignmentId).toBe(first.assignmentId);
    expect((await prisma.driverAssignment.findUniqueOrThrow({ where: { id: first.assignmentId } })).status).toBe('REPLACED');
    await expect(service.assignDriver(bookingId, unlinked.id, owner.user.id)).rejects.toBeInstanceOf(DriverNotEligibleError);
    expect(await prisma.tripEvent.count({ where: { bookingId } })).toBe(2);
  });
});
