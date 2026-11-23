import cron, { type ScheduledTask } from 'node-cron';
import type { AvailabilityService } from '../modules/bookings/availability.service.js';

/**
 * Background jobs. Started from server.ts only when ENABLE_SCHEDULER=true, so
 * tests (and additional API replicas) can call the jobs directly instead.
 */
export function startScheduler(availability: AvailabilityService): ScheduledTask[] {
  const releaseHolds = cron.schedule(
    '* * * * *',
    async () => {
      try {
        const result = await availability.releaseExpiredHolds();
        if (result.releasedHoldIds.length > 0) {
          console.info(
            `[scheduler] released ${result.releasedHoldIds.length} expired hold(s); ` +
              `expired ${result.expiredBookingIds.length} booking(s)`,
          );
        }
      } catch (error) {
        console.error('[scheduler] releaseExpiredHolds failed', error);
      }
    },
    { name: 'release-expired-holds', noOverlap: true },
  );
  return [releaseHolds];
}
