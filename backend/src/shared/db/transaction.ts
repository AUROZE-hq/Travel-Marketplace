import { Prisma, type PrismaClient } from '@prisma/client';
import { isRetryableTransactionError } from './pgErrors.js';

export type Tx = Prisma.TransactionClient;

const MAX_ATTEMPTS = 3;

/**
 * Runs `fn` in an interactive READ COMMITTED transaction. Deadlocks and
 * serialization failures are retried (the whole callback re-runs); every other
 * error — including DomainErrors — rolls back and propagates unchanged.
 */
export async function runInTransaction<T>(
  prisma: PrismaClient,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 10_000,
        timeout: 20_000,
      });
    } catch (error) {
      if (attempt < MAX_ATTEMPTS && isRetryableTransactionError(error)) continue;
      throw error;
    }
  }
}
