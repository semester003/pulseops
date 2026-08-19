import bcrypt from 'bcrypt';

import { prisma } from '../config/prisma.js';
import { AuthenticationError, ConflictError, NotFoundError } from '../utils/errors.js';
import { signAccessToken } from '../utils/jwt.js';

interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

interface LoginInput {
  email: string;
  password: string;
}

const userSelect = {
  id: true,
  email: true,
  displayName: true,
  createdAt: true,
} as const;

export class AuthService {
  public async register(input: RegisterInput) {
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictError('An account with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await prisma.user.create({
      data: { email: input.email, passwordHash, displayName: input.displayName },
      select: userSelect,
    });

    return { user, token: signAccessToken({ userId: user.id, email: user.email }) };
  }

  public async login(input: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      select: { ...userSelect, passwordHash: true },
    });

    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new AuthenticationError('Invalid email or password.');
    }

    const safeUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      createdAt: user.createdAt,
    };
    return { user: safeUser, token: signAccessToken({ userId: user.id, email: user.email }) };
  }

  public async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...userSelect,
        organizationMembers: {
          select: { organizationId: true, role: true, organization: { select: { name: true } } },
          orderBy: { organization: { name: 'asc' } },
        },
      },
    });
    if (!user) {
      throw new NotFoundError('User');
    }
    return user;
  }
}
