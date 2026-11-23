import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  at,
  baseTime,
  createBookableVehicle,
  createCategory,
  createCustomer,
  createDriver,
  createOwner,
  createQuotation,
  createVehicle,
  linkDriver,
  prisma,
  resetDatabase,
} from './helpers/fixtures.js';

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe('database constraints (raw SQL migration)', () => {
  it('7. a normal driver cannot be linked to a second vehicle', async () => {
    const category = await createCategory();
    const owner = await createOwner();
    const v1 = await createVehicle(owner.profile.id, category.id);
    const v2 = await createVehicle(owner.profile.id, category.id);
    const driver = await createDriver(owner.profile.id);
    await linkDriver(v1, driver);

    await expect(linkDriver(v2, driver)).rejects.toMatchObject({ code: 'P2002' });
    expect(await prisma.vehicleDriver.count({ where: { driverId: driver.id } })).toBe(1);
  });

  it('7b. an owner-driver may be linked to several of their own vehicles', async () => {
    const category = await createCategory();
    const owner = await createOwner('INDIVIDUAL');
    const v1 = await createVehicle(owner.profile.id, category.id);
    const v2 = await createVehicle(owner.profile.id, category.id);
    const ownerDriver = await createDriver(owner.profile.id, { userId: owner.user.id, isOwnerDriver: true });
    await linkDriver(v1, ownerDriver);
    await expect(linkDriver(v2, ownerDriver)).resolves.toBeTruthy();
  });

  it('7c. a driver cannot be linked to another owner\'s vehicle, nor lie about is_owner_driver', async () => {
    const category = await createCategory();
    const ownerA = await createOwner();
    const ownerB = await createOwner();
    const vehicleB = await createVehicle(ownerB.profile.id, category.id);
    const driverA = await createDriver(ownerA.profile.id);
    // Same owner_id as the vehicle, but the driver belongs to owner A → composite FK fails.
    await expect(
      prisma.vehicleDriver.create({
        data: { vehicleId: vehicleB.id, driverId: driverA.id, ownerId: ownerB.profile.id, isOwnerDriver: false },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    // Normal driver claiming to be an owner-driver to dodge the one-vehicle rule → FK fails.
    const vehicleA = await createVehicle(ownerA.profile.id, category.id);
    await expect(
      prisma.vehicleDriver.create({
        data: { vehicleId: vehicleA.id, driverId: driverA.id, ownerId: ownerA.profile.id, isOwnerDriver: true },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('8. a quotation with expires_at > starts_at is rejected by the database', async () => {
    const { vehicle } = await createBookableVehicle();
    const c = await createCustomer();
    const base = baseTime();
    const ok = await createQuotation({ vehicle, customerProfileId: c.profile.id, startsAt: at(base, 10), endsAt: at(base, 12) });
    await expect(
      prisma.quotation.update({ where: { id: ok.id }, data: { expiresAt: at(base, 11) } }),
    ).rejects.toThrow(/quotation_expires_before_start/);

    const request = await prisma.tripRequest.findUniqueOrThrow({ where: { id: ok.tripRequestId } });
    await prisma.quotation.delete({ where: { id: ok.id } });
    await expect(
      prisma.quotation.create({
        data: {
          tripRequestId: request.id,
          vehicleId: vehicle.id,
          startsAt: at(base, 10),
          endsAt: at(base, 12),
          baseAmount: '1000.00',
          totalAmount: '1000.00',
          expiresAt: at(base, 10.5),
        },
      }),
    ).rejects.toThrow(/quotation_expires_before_start/);
  });

  it('rejects overlapping ACTIVE occupancy and invalid ranges written directly', async () => {
    const { vehicle } = await createBookableVehicle();
    const base = baseTime();
    await prisma.vehicleOccupancy.create({
      data: { vehicleId: vehicle.id, kind: 'BLOCK', startsAt: at(base, 0), endsAt: at(base, 5), blockedUntil: at(base, 5) },
    });
    await expect(
      prisma.vehicleOccupancy.create({
        data: { vehicleId: vehicle.id, kind: 'BLOCK', startsAt: at(base, 4), endsAt: at(base, 6), blockedUntil: at(base, 6) },
      }),
    ).rejects.toThrow(/vehicle_occupancy_no_overlap/);
    // A RELEASED row may overlap.
    await expect(
      prisma.vehicleOccupancy.create({
        data: { vehicleId: vehicle.id, kind: 'BLOCK', status: 'RELEASED', startsAt: at(base, 4), endsAt: at(base, 6), blockedUntil: at(base, 6) },
      }),
    ).resolves.toBeTruthy();
    await expect(
      prisma.vehicleOccupancy.create({
        data: { vehicleId: vehicle.id, kind: 'BLOCK', startsAt: at(base, 9), endsAt: at(base, 8), blockedUntil: at(base, 8) },
      }),
    ).rejects.toThrow(/vehicle_occupancy_(valid_range|ends_valid)/);
  });

  it('rejects a document whose subject FK does not match subject_type', async () => {
    const owner = await createOwner();
    await expect(
      prisma.document.create({
        data: { subjectType: 'VEHICLE', ownerId: owner.profile.id, documentType: 'NIC', storageKey: 'k' },
      }),
    ).rejects.toThrow(/document_one_subject/);
  });
});
