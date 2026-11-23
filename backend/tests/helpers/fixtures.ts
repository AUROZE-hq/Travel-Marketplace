import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { getTestDatabaseUrl } from '../testDatabaseUrl.js';
import { PLATFORM_SETTING_DEFAULTS } from '../../src/modules/platform/settings.service.js';

export const prisma = new PrismaClient({ datasourceUrl: getTestDatabaseUrl() });

const HOUR = 60 * 60 * 1000;

/** A fixed hour one week from now, so quotations can expire before they start. */
export function baseTime(): Date {
  const d = new Date(Date.now() + 7 * 24 * HOUR);
  d.setUTCMinutes(0, 0, 0);
  return d;
}

export function at(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * HOUR);
}

export async function resetDatabase(): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  for (const [key, value] of Object.entries(PLATFORM_SETTING_DEFAULTS)) {
    await prisma.platformSetting.create({ data: { key, value } });
  }
}

const unique = () => randomUUID().slice(0, 8);

export async function createUser(roles: ('CUSTOMER' | 'OWNER' | 'DRIVER' | 'ADMIN')[], name = 'Test User') {
  return prisma.user.create({
    data: {
      email: `${unique()}@test.example.com`,
      fullName: name,
      passwordHash: '!disabled',
      roles: { create: roles.map((role) => ({ role })) },
    },
  });
}

export async function createCustomer(name = 'Customer') {
  const user = await createUser(['CUSTOMER'], name);
  const profile = await prisma.customerProfile.create({ data: { userId: user.id } });
  return { user, profile };
}

export async function createCategory() {
  const slug = `cat-${unique()}`;
  return prisma.vehicleCategory.create({ data: { name: slug, slug } });
}

export async function createOwner(ownerType: 'INDIVIDUAL' | 'BUSINESS' = 'BUSINESS') {
  const user = await createUser(['OWNER'], 'Owner');
  const profile = await prisma.ownerProfile.create({
    data: {
      userId: user.id,
      ownerType,
      businessName: ownerType === 'BUSINESS' ? 'Test Tours' : null,
      verificationStatus: 'APPROVED',
    },
  });
  return { user, profile };
}

export async function createVehicle(ownerId: string, categoryId: string) {
  return prisma.vehicle.create({
    data: {
      ownerId,
      categoryId,
      make: 'Toyota',
      model: 'Test',
      year: 2020,
      registrationNumber: `T-${unique()}`,
      seats: 4,
      transmission: 'AUTOMATIC',
      fuelType: 'PETROL',
      approvalStatus: 'APPROVED',
      isActive: true,
    },
  });
}

export async function createDriver(ownerId: string, opts: { userId?: string; isOwnerDriver?: boolean } = {}) {
  return prisma.driverProfile.create({
    data: {
      ownerId,
      userId: opts.userId,
      fullName: 'Driver',
      licenceNumber: `L-${unique()}`,
      verificationStatus: 'APPROVED',
      isOwnerDriver: opts.isOwnerDriver ?? false,
    },
  });
}

export async function linkDriver(
  vehicle: { id: string; ownerId: string },
  driver: { id: string; isOwnerDriver: boolean },
) {
  return prisma.vehicleDriver.create({
    data: { vehicleId: vehicle.id, driverId: driver.id, ownerId: vehicle.ownerId, isOwnerDriver: driver.isOwnerDriver },
  });
}

/** Business owner with one approved vehicle and one approved, linked driver. */
export async function createBookableVehicle() {
  const category = await createCategory();
  const owner = await createOwner('BUSINESS');
  const vehicle = await createVehicle(owner.profile.id, category.id);
  const driver = await createDriver(owner.profile.id);
  await linkDriver(vehicle, driver);
  return { owner, vehicle, driver, category };
}

/** Trip request (QUOTED) + SENT quotation for [startsAt, endsAt), expiring 1h before start. */
export async function createQuotation(args: {
  vehicle: { id: string; ownerId: string };
  customerProfileId: string;
  startsAt: Date;
  endsAt: Date;
}) {
  const request = await prisma.tripRequest.create({
    data: {
      customerId: args.customerProfileId,
      vehicleId: args.vehicle.id,
      ownerId: args.vehicle.ownerId,
      tripType: 'ONE_WAY',
      pickupAddress: 'Bandaranaike International Airport',
      destinationAddress: 'Kandy',
      requestedStartAt: args.startsAt,
      passengerCount: 2,
      status: 'QUOTED',
    },
  });
  return prisma.quotation.create({
    data: {
      tripRequestId: request.id,
      vehicleId: args.vehicle.id,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      baseAmount: '15000.00',
      totalAmount: '16500.00',
      expiresAt: new Date(args.startsAt.getTime() - 60 * 60 * 1000),
      charges: { create: [{ label: 'Highway tolls', amount: '1500.00' }] },
    },
  });
}

/** Creates a quotation, holds it and confirms it. Returns the confirmed booking id. */
export async function createConfirmedBooking(
  service: { createHold: (q: string, u: string) => Promise<{ bookingId: string }>; confirmHold: (b: string) => Promise<unknown> },
  args: { vehicle: { id: string; ownerId: string }; startsAt: Date; endsAt: Date },
) {
  const customer = await createCustomer();
  const q = await createQuotation({ ...args, customerProfileId: customer.profile.id });
  const { bookingId } = await service.createHold(q.id, customer.user.id);
  await service.confirmHold(bookingId);
  return bookingId;
}
