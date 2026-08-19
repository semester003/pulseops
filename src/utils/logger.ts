import pino, { type LoggerOptions } from 'pino';

import { env } from '../config/env.js';

const options: LoggerOptions = {
  level: env.LOG_LEVEL,
  base: null,
  redact: {
    paths: ['req.headers.authorization', 'password', 'passwordHash', 'jwtSecret'],
    censor: '[REDACTED]',
  },
};

if (env.NODE_ENV === 'development') {
  options.transport = {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:standard' },
  };
}

export const logger = pino(options);
