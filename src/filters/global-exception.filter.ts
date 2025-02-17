import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { GqlArgumentsHost } from "@nestjs/graphql";
import { Response } from "express";
import { ZodError } from "zod";

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const isGraphQL = host.getType<string>() === "graphql";

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Internal server error";
    let details = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.message;
    } else if (exception instanceof ZodError) {
      status = HttpStatus.BAD_REQUEST;
      message = "Validation failed";
      details = exception.errors;
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const errorResponse = {
      statusCode: status,
      message,
      details,
      timestamp: new Date().toISOString(),
    };

    if (isGraphQL) {
      // For GraphQL, throw the error to be handled by GraphQL
      throw new HttpException(errorResponse, status);
    }

    // For REST endpoints
    return response.status(status).json(errorResponse);
  }
}
