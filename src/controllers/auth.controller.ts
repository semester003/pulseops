import type { RequestHandler } from 'express';
import type { z } from 'zod';

import { loginSchema, registerSchema } from '../schemas/core.schemas.js';
import { AuthService } from '../services/auth.service.js';
import { AuthenticationError } from '../utils/errors.js';

const authService = new AuthService();

export const register: RequestHandler = async (request, response) => {
  const result = await authService.register(request.body as z.infer<typeof registerSchema>);
  response.status(201).json(result);
};

export const login: RequestHandler = async (request, response) => {
  const result = await authService.login(request.body as z.infer<typeof loginSchema>);
  response.status(200).json(result);
};

export const getMe: RequestHandler = async (request, response) => {
  const userId = request.auth?.userId;
  if (!userId) {
    throw new AuthenticationError();
  }
  response.status(200).json({ user: await authService.getMe(userId) });
};
