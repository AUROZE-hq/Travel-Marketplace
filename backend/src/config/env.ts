import 'dotenv/config';
import { z } from 'zod';

const booleanFlag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const KNOWN_DEV_SECRETS = new Set([
  'dev-jwt-secret-at-least-32-chars-long-for-testing-auroze',
  'dev-insecure-jwt-secret-key-32-chars-minimum-auroze',
  '12345678901234567890123456789012',
  'secretsecretsecretsecretsecret32',
]);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(5000),
    DATABASE_URL: z.string().url(),
    FRONTEND_URL: z.string().url(),
    /** Run background jobs (e.g. release expired payment holds every minute). */
    ENABLE_SCHEDULER: booleanFlag,
    /** Deployment-configurable trusted proxy setting ('false', 'true', hop count '1', or subnet). */
    TRUST_PROXY: z.string().default('false'),

    // Authentication and Security
    JWT_SECRET: z.string().default('dev-jwt-secret-at-least-32-chars-long-for-testing-auroze'),
    JWT_ISSUER: z.string().default('travel-marketplace-api'),
    JWT_AUDIENCE: z.string().default('travel-marketplace-app'),
    JWT_ACCESS_EXPIRY: z.string().default('15m'),
    REFRESH_TOKEN_EXPIRY_DAYS: z.coerce.number().int().positive().default(7),
    PASSWORD_RESET_TOKEN_EXPIRY_MINUTES: z.coerce.number().int().positive().default(15),
    PASSWORD_RESET_URL: z.string().url().default('http://localhost:5173/reset-password'),

    // SMTP / Email Delivery
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().default('no-reply@travelmarketplace.lk'),
    SMTP_SECURE: booleanFlag,
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      const secret = process.env.JWT_SECRET;
      if (!secret || secret.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'JWT_SECRET must be at least 32 characters in production',
          path: ['JWT_SECRET'],
        });
      } else if (KNOWN_DEV_SECRETS.has(secret)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'JWT_SECRET cannot be a known development default secret in production',
          path: ['JWT_SECRET'],
        });
      }
    }
  });

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
