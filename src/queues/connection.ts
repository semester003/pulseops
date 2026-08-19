import IORedis from 'ioredis';

import { env } from '../config/env.js';

export const redisConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: false,
});

redisConnection.on('error', () => {
  // Connection errors are logged by the queue producers and worker event handlers.
});
