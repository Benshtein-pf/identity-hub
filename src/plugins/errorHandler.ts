import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from "fastify-type-provider-zod";
import { AppError, ERROR_CODE_STATUS, type ErrorResponse } from "../contract/errors.js";

function sendError(reply: FastifyReply, status: number, body: ErrorResponse): void {
  reply.code(status).send(body);
}

/**
 * Single place that turns any thrown error into the structured error body
 * defined in contract/errors.ts. Never forwards a raw stack trace or
 * upstream payload to the client (CLAUDE.md); unexpected errors are logged
 * server-side with full detail and returned to the client as a generic
 * INTERNAL_ERROR.
 */
export function registerErrorHandler(fastify: FastifyInstance): void {
  fastify.setNotFoundHandler((_request, reply) => {
    sendError(reply, 404, { error: { code: "NOT_FOUND", message: "This route does not exist." } });
  });

  fastify.setErrorHandler((error, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof AppError) {
      sendError(reply, ERROR_CODE_STATUS[error.code], {
        error: { code: error.code, message: error.message, details: error.details }
      });
      return;
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      sendError(reply, ERROR_CODE_STATUS.VALIDATION_ERROR, {
        error: {
          code: "VALIDATION_ERROR",
          message: "The request did not match the expected shape. Check required fields and types.",
          details: error.validation
        }
      });
      return;
    }

    if (isResponseSerializationError(error)) {
      // We failed to produce a response matching our own contract -- a bug on our side, not the caller's.
      request.log.error({ err: error }, "Response failed to match its own schema");
      sendError(reply, 500, {
        error: { code: "INTERNAL_ERROR", message: "Something went wrong while building the response." }
      });
      return;
    }

    request.log.error({ err: error }, "Unhandled error");
    sendError(reply, 500, {
      error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." }
    });
  });
}
