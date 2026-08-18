import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : typeof exceptionResponse === 'object' && exceptionResponse !== null
          ? (exceptionResponse as any).message
          : 'Internal server error';

    const correlationId = (request.headers['x-correlation-id'] as string) || uuidv4();

    response.status(status).json({
      error: {
        code: status === 404 ? 'NOT_FOUND' : status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : status === 400 ? 'BAD_REQUEST' : 'INTERNAL_ERROR',
        message: Array.isArray(message) ? message.join(', ') : message,
        retryable: status >= 500,
        field_errors: typeof exceptionResponse === 'object' && exceptionResponse !== null ? (exceptionResponse as any).field_errors : [],
        correlation_id: correlationId,
      },
    });
  }
}
