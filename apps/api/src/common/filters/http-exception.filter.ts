import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import { AppException } from '../app-exception';
import { ErrorCode, type ErrorEnvelope } from '../errors';

/**
 * Global exception filter that coerces every thrown error into the shared
 * envelope `{ statusCode, code, message, details? }`.
 *
 * Resolution order:
 *  1. `AppException` — carries an explicit `code` / `details`.
 *  2. `BadRequestException` from the global ValidationPipe — message is a
 *     `string[]` of class-validator errors; mapped to `VALIDATION_FAILED`.
 *  3. Other `HttpException` subclasses — derive `code` from status.
 *  4. Anything else — `500 INTERNAL_ERROR` (full stack logged, not exposed).
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const envelope = this.toEnvelope(exception);

    if (envelope.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${envelope.code}] ${envelope.message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(envelope.statusCode).json(envelope);
  }

  private toEnvelope(exception: unknown): ErrorEnvelope {
    if (exception instanceof AppException) {
      return {
        statusCode: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const envelope = this.fromNestHttpException(status, payload, exception.message);

      return envelope;
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message:
        exception instanceof Error ? exception.message : 'Unknown server error',
    };
  }

  private fromNestHttpException(
    status: number,
    payload: string | object,
    fallbackMessage: string,
  ): ErrorEnvelope {
    const code = this.codeFromStatus(status);

    if (typeof payload === 'string') {
      return { statusCode: status, code, message: payload };
    }

    const body = payload as {
      message?: string | string[];
      code?: string;
      details?: Record<string, unknown>;
    };

    if (Array.isArray(body.message)) {
      return {
        statusCode: status,
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Request validation failed.',
        details: { errors: body.message },
      };
    }

    return {
      statusCode: status,
      code: body.code ?? code,
      message: body.message ?? fallbackMessage,
      details: body.details,
    };
  }

  private codeFromStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.VALIDATION_FAILED;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.AUTH_INVALID_TOKEN;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.INSUFFICIENT_PERMISSION;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }
}
