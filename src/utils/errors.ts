export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  public constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class AuthenticationError extends AppError {
  public constructor(message = 'Authentication is required.') {
    super(401, 'AUTHENTICATION_REQUIRED', message);
  }
}

export class AuthorizationError extends AppError {
  public constructor(message = 'You are not authorized to perform this action.') {
    super(403, 'FORBIDDEN', message);
  }
}

export class NotFoundError extends AppError {
  public constructor(resource: string) {
    super(404, 'NOT_FOUND', `${resource} was not found.`);
  }
}

export class ConflictError extends AppError {
  public constructor(message: string) {
    super(409, 'CONFLICT', message);
  }
}

export class StateTransitionError extends AppError {
  public constructor(message: string) {
    super(409, 'INVALID_STATE_TRANSITION', message);
  }
}
