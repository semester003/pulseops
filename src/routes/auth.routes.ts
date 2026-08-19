import { Router } from 'express';

import { getMe, login, register } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler, validate } from '../middleware/validate.js';
import { loginSchema, registerSchema } from '../schemas/core.schemas.js';

export const authRouter = Router();

authRouter.post('/register', validate(registerSchema), asyncHandler(register));
authRouter.post('/login', validate(loginSchema), asyncHandler(login));
authRouter.get('/me', authenticate, asyncHandler(getMe));
