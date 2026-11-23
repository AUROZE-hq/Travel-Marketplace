import 'dotenv/config';
import { z } from 'zod';

const booleanFlag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.string().url(),
  FRONTEND_URL: z.string().url(),
  /** Run background jobs (e.g. release expired payment holds every minute). */
  ENABLE_SCHEDULER: booleanFlag,
});

export const env = envSchema.parse(process.env);
