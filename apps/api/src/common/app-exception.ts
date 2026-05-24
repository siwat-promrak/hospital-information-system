import { HttpException, HttpStatus } from '@nestjs/common';

import { ErrorCode, type ErrorCodeValue } from './errors';

/**
 * Domain exception that carries a stable `code` alongside the HTTP status.
 *
 * The global `HttpExceptionFilter` reads `code` / `details` from this
 * exception when serialising the response envelope. Throwing the base
 * Nest `HttpException` (or any of its subclasses) is still supported —
 * the filter falls back to a derived code in that case.
 */
export class AppException extends HttpException {
  readonly code: ErrorCodeValue | string;
  readonly details?: Record<string, unknown>;

  constructor(
    status: HttpStatus,
    code: ErrorCodeValue | string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super({ statusCode: status, code, message, details }, status);
    this.code = code;
    this.details = details;
  }

  static unauthorized(code: ErrorCodeValue | string, message: string): AppException {
    return new AppException(HttpStatus.UNAUTHORIZED, code, message);
  }

  static forbidden(
    code: ErrorCodeValue | string,
    message: string,
    details?: Record<string, unknown>,
  ): AppException {
    return new AppException(HttpStatus.FORBIDDEN, code, message, details);
  }

  static badRequest(
    code: ErrorCodeValue | string,
    message: string,
    details?: Record<string, unknown>,
  ): AppException {
    return new AppException(HttpStatus.BAD_REQUEST, code, message, details);
  }

  static notFound(code: ErrorCodeValue | string, message: string): AppException {
    return new AppException(HttpStatus.NOT_FOUND, code, message);
  }

  static insufficientPermission(required: string[], held: string[]): AppException {
    return new AppException(
      HttpStatus.FORBIDDEN,
      ErrorCode.INSUFFICIENT_PERMISSION,
      'Caller is missing the required permission(s).',
      { required, held },
    );
  }
}
