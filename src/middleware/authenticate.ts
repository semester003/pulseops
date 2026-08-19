import type { RequestHandler } from 'express';

import { AuthenticationError } from '../utils/errors.js';
import { verifyAccessToken } from '../utils/jwt.js';

export const authenticate: RequestHandler = (request, _response, next) => {
  const authorization = request.header('authorization');

  if (!authorization?.startsWith('Bearer ')) {
    next(new AuthenticationError());
    return;
  }

  try {
    request.auth = verifyAccessToken(authorization.slice('Bearer '.length));
    next();
  } catch {
    next(new AuthenticationError('Your access token is invalid or expired.'));
  }
};
