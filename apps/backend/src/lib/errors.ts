import { ErrorCode } from '@vpn/types';

/** Application error carrying an HTTP status + canonical error code. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly errorCode: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(404, ErrorCode.NotFound, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, ErrorCode.Unauthorized, message);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed') {
    super(400, ErrorCode.ValidationError, message);
  }
}

export class DeviceBlockedError extends AppError {
  constructor(message = 'Device is blocked') {
    super(403, ErrorCode.DeviceBlocked, message);
  }
}

export class InsufficientBalanceError extends AppError {
  constructor(message = 'Insufficient VPN minutes') {
    super(403, ErrorCode.InsufficientBalance, message);
  }
}
