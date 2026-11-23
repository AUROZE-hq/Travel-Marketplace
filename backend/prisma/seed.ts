/**
 * Idempotent development seed. Safe to run repeatedly: every write is an
 * upsert keyed on a natural unique key (slug, email, registration number,
 * licence number, setting key, composite link keys).
 *
 *   npm run db:seed --workspace backend
 *
 * Credentials are never hardcoded:
 *   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SEED_ADMIN_NAME  → admin user
 *   SEED_SAMPLE_PASSWORD (optional) → password for the sample accounts.
 *     If unset, sample accounts get an unusable password hash (cannot log in).
 *
 * Everything except categories and platform settings is SAMPLE DATA
 * (`@example.com` emails, areas with is_sample = true).
 */
import 'dotenv/config';
import { randomBytes, scryptSync } from 'node:crypto';
import {
  PrismaClient,
  type FuelType,
  type PricingUnit,
  type Role,
  type Transmission,
} from '@prisma/client';
import {
  PLATFORM_SETTING_DEFAULTS,
  PLATFORM_SETTING_DESCRIPTIONS,
  type PlatformSettingKey,
} from '../src/modules/platform/settings.service.js';

const prisma = new PrismaClient();

/**
 * Interim password hash format (scrypt, node:crypto — no extra dependency):
 *   scrypt$N=16384,r=8,p=1$<salt base64>$<hash base64>
 * Stage 3 (auth) owns the final hashing scheme and may re-hash on login.
 */
function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$N=16384,r=8,p=1$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/** A value that no password can ever match. */
const UNUSABLE_PASSWORD_HASH = '!disabled';

const CATEGORIES = [
  { name: 'Car', slug: 'car' },
  { name: 'SUV', slug: 'suv' },
  { name: 'Van', slug: 'van' },
  { name: 'Mini Bus', slug: 'mini-bus' },
  { name: 'Bus', slug: 'bus' },
  { name: 'Luxury', slug: 'luxury' },
  { name: 'Three-Wheeler', slug: 'three-wheeler' },
];

/** SAMPLE DATA — a few Sri Lankan districts. The full list is admin-managed. */
const SAMPLE_AREAS = [
  { name: 'Colombo', slug: 'colombo' },
  { name: 'Gampaha', slug: 'gampaha' },
  { name: 'Kandy', slug: 'kandy' },
  { name: 'Galle', slug: 'galle' },
];

async function upsertUser(args: {
  email: string;
  fullName: string;
  phone?: string;
  passwordHash: string;
  roles: Role[];
  /** Only refresh the hash when we were given a real password. */
  refreshPassword: boolean;
}) {
  const user = await prisma.user.upsert({
    where: { email: args.email },
    create: {
      email: args.email,
      fullName: args.fullName,
      phone: args.phone,
      passwordHash: args.passwordHash,
      emailVerifiedAt: new Date(),
    },
    update: {
      fullName: args.fullName,
      phone: args.phone,
      ...(args.refreshPassword ? { passwordHash: args.passwordHash } : {}),
    },
  });
  for (const role of args.roles) {
    await prisma.userRole.upsert({
      where: { userId_role: { userId: user.id, role } },
      create: { userId: user.id, role },
      update: {},
    });
  }
  return user;
}

async function upsertVehicle(args: {
  ownerId: string;
  categorySlug: string;
  make: string;
  model: string;
  year: number;
  registrationNumber: string;
  seats: number;
  luggageCapacity: number;
  transmission: Transmission;
  fuelType: FuelType;
  features: string[];
  description: string;
  prices: { unit: PricingUnit; amount: string; notes?: string }[];
}) {
  const category = await prisma.vehicleCategory.findUniqueOrThrow({ where: { slug: args.categorySlug } });
  const data = {
    categoryId: category.id,
    make: args.make,
    model: args.model,
    year: args.year,
    seats: args.seats,
    luggageCapacity: args.luggageCapacity,
    airConditioned: true,
    transmission: args.transmission,
    fuelType: args.fuelType,
    features: args.features,
    description: args.description,
    approvalStatus: 'APPROVED' as const,
    approvedAt: new Date(),
    isActive: true,
  };
  const vehicle = await prisma.vehicle.upsert({
    where: { registrationNumber: args.registrationNumber },
    create: { ...data, ownerId: args.ownerId, registrationNumber: args.registrationNumber },
    update: data,
  });
  for (const price of args.prices) {
    await prisma.indicativePrice.upsert({
      where: { vehicleId_pricingUnit: { vehicleId: vehicle.id, pricingUnit: price.unit } },
      create: { vehicleId: vehicle.id, pricingUnit: price.unit, amount: price.amount, notes: price.notes },
      update: { amount: price.amount, notes: price.notes },
    });
  }
  return vehicle;
}

async function upsertDriver(args: {
  ownerId: string;
  userId?: string;
  fullName: string;
  phone: string;
  licenceNumber: string;
  isOwnerDriver: boolean;
}) {
  const data = {
    fullName: args.fullName,
    phone: args.phone,
    verificationStatus: 'APPROVED' as const,
    isActive: true,
  };
  return prisma.driverProfile.upsert({
    where: { licenceNumber: args.licenceNumber },
    create: {
      ...data,
      ownerId: args.ownerId,
      userId: args.userId,
      licenceNumber: args.licenceNumber,
      isOwnerDriver: args.isOwnerDriver,
    },
    update: data,
  });
}

async function linkDriver(vehicle: { id: string; ownerId: string }, driver: { id: string; isOwnerDriver: boolean }) {
  await prisma.vehicleDriver.upsert({
    where: { vehicleId_driverId: { vehicleId: vehicle.id, driverId: driver.id } },
    create: {
      vehicleId: vehicle.id,
      driverId: driver.id,
      ownerId: vehicle.ownerId,
      isOwnerDriver: driver.isOwnerDriver,
    },
    update: {},
  });
}

async function seedReferenceData() {
  for (const [index, category] of CATEGORIES.entries()) {
    await prisma.vehicleCategory.upsert({
      where: { slug: category.slug },
      create: { ...category, sortOrder: index + 1 },
      update: { name: category.name },
    });
  }
  for (const [index, area] of SAMPLE_AREAS.entries()) {
    await prisma.area.upsert({
      where: { slug: area.slug },
      create: { ...area, sortOrder: index + 1, isSample: true },
      update: {},
    });
  }
  // Defaults only — never overwrite values an admin has changed.
  for (const key of Object.keys(PLATFORM_SETTING_DEFAULTS) as PlatformSettingKey[]) {
    await prisma.platformSetting.upsert({
      where: { key },
      create: { key, value: PLATFORM_SETTING_DEFAULTS[key], description: PLATFORM_SETTING_DESCRIPTIONS[key] },
      update: { description: PLATFORM_SETTING_DESCRIPTIONS[key] },
    });
  }
}

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping admin user.');
    return;
  }
  if (password.length < 12) throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters.');
  await upsertUser({
    email: email.toLowerCase(),
    fullName: process.env.SEED_ADMIN_NAME ?? 'Platform Admin',
    passwordHash: hashPassword(password),
    roles: ['ADMIN'],
    refreshPassword: true,
  });
}

async function seedSampleMarketplace() {
  const samplePassword = process.env.SEED_SAMPLE_PASSWORD;
  const sampleHash = () => (samplePassword ? hashPassword(samplePassword) : UNUSABLE_PASSWORD_HASH);
  const refreshPassword = Boolean(samplePassword);

  const areas = await prisma.area.findMany({ where: { slug: { in: SAMPLE_AREAS.map((a) => a.slug) } } });
  const areaId = (slug: string) => areas.find((a) => a.slug === slug)!.id;

  // --- Individual owner who drives their own two vehicles (owner-driver) -----
  const kamalUser = await upsertUser({
    email: 'kamal.owner@example.com',
    fullName: 'Kamal Perera',
    phone: '+94770000001',
    passwordHash: sampleHash(),
    roles: ['OWNER', 'DRIVER'],
    refreshPassword,
  });
  const kamal = await prisma.ownerProfile.upsert({
    where: { userId: kamalUser.id },
    create: { userId: kamalUser.id, ownerType: 'INDIVIDUAL', verificationStatus: 'APPROVED', verifiedAt: new Date() },
    update: {},
  });
  const kamalDriver = await upsertDriver({
    ownerId: kamal.id,
    userId: kamalUser.id,
    fullName: 'Kamal Perera',
    phone: '+94770000001',
    licenceNumber: 'SAMPLE-B1000001',
    isOwnerDriver: true,
  });
  const kamalCar = await upsertVehicle({
    ownerId: kamal.id,
    categorySlug: 'car',
    make: 'Toyota',
    model: 'Axio',
    year: 2017,
    registrationNumber: 'SAMPLE-CAR-1001',
    seats: 4,
    luggageCapacity: 2,
    transmission: 'AUTOMATIC',
    fuelType: 'HYBRID',
    features: ['A/C', 'Bluetooth'],
    description: 'Sample: comfortable hybrid sedan for city and airport transfers.',
    prices: [
      { unit: 'PER_KM', amount: '120.00' },
      { unit: 'PER_DAY', amount: '12000.00', notes: 'Up to 100 km per day' },
    ],
  });
  const kamalVan = await upsertVehicle({
    ownerId: kamal.id,
    categorySlug: 'van',
    make: 'Toyota',
    model: 'KDH 200',
    year: 2015,
    registrationNumber: 'SAMPLE-VAN-1002',
    seats: 9,
    luggageCapacity: 6,
    transmission: 'MANUAL',
    fuelType: 'DIESEL',
    features: ['A/C', 'Reclining seats'],
    description: 'Sample: family and small-group tours.',
    prices: [{ unit: 'PER_DAY', amount: '18000.00', notes: 'Driver meals included' }],
  });
  await linkDriver(kamalCar, kamalDriver);
  await linkDriver(kamalVan, kamalDriver);
  for (const slug of ['colombo', 'gampaha']) {
    await prisma.ownerOperatingArea.upsert({
      where: { ownerId_areaId: { ownerId: kamal.id, areaId: areaId(slug) } },
      create: { ownerId: kamal.id, areaId: areaId(slug) },
      update: {},
    });
  }

  // --- Business owner with two vehicles and three drivers ---------------------
  const lankaUser = await upsertUser({
    email: 'ops@lankatours.example.com',
    fullName: 'Nimali Fernando',
    phone: '+94770000002',
    passwordHash: sampleHash(),
    roles: ['OWNER'],
    refreshPassword,
  });
  const lanka = await prisma.ownerProfile.upsert({
    where: { userId: lankaUser.id },
    create: {
      userId: lankaUser.id,
      ownerType: 'BUSINESS',
      businessName: 'Sample Lanka Tours (Pvt) Ltd',
      businessRegNumber: 'SAMPLE-PV-00001',
      verificationStatus: 'APPROVED',
      verifiedAt: new Date(),
    },
    update: {},
  });
  const lankaSuv = await upsertVehicle({
    ownerId: lanka.id,
    categorySlug: 'suv',
    make: 'Toyota',
    model: 'Land Cruiser Prado',
    year: 2019,
    registrationNumber: 'SAMPLE-SUV-2001',
    seats: 6,
    luggageCapacity: 4,
    transmission: 'AUTOMATIC',
    fuelType: 'DIESEL',
    features: ['A/C', '4x4', 'Wi-Fi'],
    description: 'Sample: hill-country and safari trips.',
    prices: [{ unit: 'PER_DAY', amount: '35000.00' }],
  });
  const lankaBus = await upsertVehicle({
    ownerId: lanka.id,
    categorySlug: 'mini-bus',
    make: 'Toyota',
    model: 'Coaster',
    year: 2016,
    registrationNumber: 'SAMPLE-MBUS-2002',
    seats: 26,
    luggageCapacity: 20,
    transmission: 'MANUAL',
    fuelType: 'DIESEL',
    features: ['A/C', 'PA system'],
    description: 'Sample: group tours and weddings.',
    prices: [
      { unit: 'PER_DAY', amount: '45000.00' },
      { unit: 'PER_KM', amount: '250.00' },
    ],
  });
  const driverUser = await upsertUser({
    email: 'sunil.driver@example.com',
    fullName: 'Sunil Silva',
    phone: '+94770000003',
    passwordHash: sampleHash(),
    roles: ['DRIVER'],
    refreshPassword,
  });
  const sunil = await upsertDriver({
    ownerId: lanka.id,
    userId: driverUser.id,
    fullName: 'Sunil Silva',
    phone: '+94770000003',
    licenceNumber: 'SAMPLE-B2000001',
    isOwnerDriver: false,
  });
  const ruwan = await upsertDriver({
    ownerId: lanka.id,
    fullName: 'Ruwan Jayasinghe',
    phone: '+94770000004',
    licenceNumber: 'SAMPLE-B2000002',
    isOwnerDriver: false,
  });
  const chaminda = await upsertDriver({
    ownerId: lanka.id,
    fullName: 'Chaminda Bandara',
    phone: '+94770000005',
    licenceNumber: 'SAMPLE-D2000003',
    isOwnerDriver: false,
  });
  // Each normal driver is linked to exactly one vehicle; a vehicle may have many.
  await linkDriver(lankaSuv, sunil);
  await linkDriver(lankaSuv, ruwan);
  await linkDriver(lankaBus, chaminda);
  for (const slug of ['colombo', 'kandy', 'galle']) {
    await prisma.ownerOperatingArea.upsert({
      where: { ownerId_areaId: { ownerId: lanka.id, areaId: areaId(slug) } },
      create: { ownerId: lanka.id, areaId: areaId(slug) },
      update: {},
    });
  }

  // --- Customers ----------------------------------------------------------------
  for (const c of [
    { email: 'anna.customer@example.com', fullName: 'Anna Schmidt', phone: '+491700000001' },
    { email: 'dilan.customer@example.com', fullName: 'Dilan Wickramasinghe', phone: '+94770000010' },
  ]) {
    const user = await upsertUser({ ...c, passwordHash: sampleHash(), roles: ['CUSTOMER'], refreshPassword });
    await prisma.customerProfile.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });
  }
}

async function main() {
  await seedReferenceData();
  await seedAdmin();
  await seedSampleMarketplace();

  const counts = {
    categories: await prisma.vehicleCategory.count(),
    areas: await prisma.area.count(),
    users: await prisma.user.count(),
    owners: await prisma.ownerProfile.count(),
    drivers: await prisma.driverProfile.count(),
    vehicles: await prisma.vehicle.count(),
    vehicleDriverLinks: await prisma.vehicleDriver.count(),
    settings: await prisma.platformSetting.count(),
  };
  console.info('Seed complete:', counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
