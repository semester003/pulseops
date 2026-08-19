import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';
import type { AuthContext } from '../types/auth.js';

interface JwtPayload {
  sub: string;
  email: string;
}

export function signAccessToken(auth: AuthContext): string {
  const options: jwt.SignOptions = {
    subject: auth.userId,
    expiresIn: env.JWT_EXPIRES_IN as Exclude<jwt.SignOptions['expiresIn'], undefined>,
  };
  return jwt.sign({ email: auth.email }, env.JWT_SECRET, options);
}

export function verifyAccessToken(token: string): AuthContext {
  const decoded = jwt.verify(token, env.JWT_SECRET);

  if (
    typeof decoded === 'string' ||
    typeof decoded.sub !== 'string' ||
    typeof decoded.email !== 'string'
  ) {
    throw new Error('Invalid JWT payload.');
  }

  const payload = decoded as jwt.JwtPayload & JwtPayload;
  return { userId: payload.sub, email: payload.email };
}
