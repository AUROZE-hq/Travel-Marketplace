import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { startScheduler } from './jobs/scheduler.js';
import { createAvailabilityService } from './modules/bookings/availability.service.js';

app.listen(env.PORT, () => {
  console.info(`API listening on http://localhost:${env.PORT}`);
});

if (env.ENABLE_SCHEDULER) {
  startScheduler(createAvailabilityService(prisma));
  console.info('Background scheduler enabled');
}
