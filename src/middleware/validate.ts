import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';

import { AppError } from '../utils/errors.js';

export function validate(
  schema: ZodTypeAny,
  source: 'body' | 'params' | 'query' = 'body',
): RequestHandler {
  return (request, _response, next) => {
    const result = schema.safeParse(request[source]);
    if (!result.success) {
      next(
        new AppError(400, 'VALIDATION_ERROR', 'Request validation failed.', result.error.flatten()),
      );
      return;
    }

    if (source === 'body') {
      request.body = result.data;
    }
    next();
  };
}

export function asyncHandler(handler: RequestHandler): RequestHandler {
  return (request, response, next) => {
    void Promise.resolve(handler(request, response, next)).catch(next);
  };
}
