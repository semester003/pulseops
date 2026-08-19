import { Prisma } from '@prisma/client';
import type { ErrorRequestHandler, RequestHandler } from 'express';

import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `No route matches ${request.method} ${request.path}.`));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      response.status(409).json({
        error: { code: 'CONFLICT', message: 'A record with this unique value already exists.' },
      });
      return;
    }
    if (error.code === 'P2025') {
      response
        .status(404)
        .json({ error: { code: 'NOT_FOUND', message: 'The requested record was not found.' } });
      return;
    }
  }

  logger.error(
    { err: error, method: request.method, path: request.path },
    'Unhandled request error',
  );
  response.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message:
        env.NODE_ENV === 'production'
          ? 'An unexpected error occurred.'
          : 'An unexpected error occurred.',
    },
  });
};
