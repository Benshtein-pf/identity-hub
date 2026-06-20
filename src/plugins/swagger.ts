import type { FastifyInstance } from "fastify";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUI from "@fastify/swagger-ui";
import { jsonSchemaTransform } from "fastify-type-provider-zod";

/**
 * Generates the OpenAPI document straight from the zod route schemas (no
 * hand-written duplicate spec to drift from the contract in src/contract).
 * Served at /docs/json (raw spec) and /docs (Swagger UI) -- this is the
 * artifact the frontend builds against, per the "frozen API contract"
 * deliverable.
 */
export async function registerSwagger(fastify: FastifyInstance): Promise<void> {
  await fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: "IdentityHub Jira Integration API",
        description: "POC backend: app auth, Jira OAuth connect, ticket creation, and the external findings API.",
        version: "0.1.0"
      }
    },
    transform: jsonSchemaTransform
  });

  await fastify.register(fastifySwaggerUI, {
    routePrefix: "/docs"
  });
}
