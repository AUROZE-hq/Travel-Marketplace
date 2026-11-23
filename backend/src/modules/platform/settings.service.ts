import { z } from 'zod';
import type { Tx } from '../../shared/db/transaction.js';
import type { PrismaClient } from '@prisma/client';

/**
 * Admin-configurable platform settings stored in `platform_setting`.
 * Missing keys fall back to these defaults (which the seed also writes).
 */
export const PLATFORM_SETTING_DEFAULTS = {
  commissionPercent: 10,
  quotationExpiryMinHours: 1,
  quotationExpiryMaxHours: 72,
  holdDurationMinutes: 15,
  tripBufferMinutes: 60,
} as const;

export type PlatformSettingKey = keyof typeof PLATFORM_SETTING_DEFAULTS;
export type PlatformSettings = Record<PlatformSettingKey, number>;

export const PLATFORM_SETTING_DESCRIPTIONS: Record<PlatformSettingKey, string> = {
  commissionPercent: 'Platform commission as a percentage of the booking total',
  quotationExpiryMinHours: 'Minimum quotation validity an owner may choose (hours)',
  quotationExpiryMaxHours: 'Maximum quotation validity an owner may choose (hours)',
  holdDurationMinutes: 'How long an accepted quotation holds the vehicle awaiting payment (minutes)',
  tripBufferMinutes: 'Buffer added after each trip before the vehicle can be booked again (minutes)',
};

const numericSetting = z.coerce.number().finite().nonnegative();

export async function getPlatformSettings(db: Tx | PrismaClient): Promise<PlatformSettings> {
  const keys = Object.keys(PLATFORM_SETTING_DEFAULTS) as PlatformSettingKey[];
  const rows = await db.platformSetting.findMany({ where: { key: { in: keys } } });
  const settings: PlatformSettings = { ...PLATFORM_SETTING_DEFAULTS };
  for (const row of rows) {
    const parsed = numericSetting.safeParse(row.value);
    if (parsed.success) settings[row.key as PlatformSettingKey] = parsed.data;
  }
  return settings;
}
