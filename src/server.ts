import { buildApp, createDependencies } from "./app.js";
import { env } from "./config/env.js";

async function main(): Promise<void> {
  const deps = createDependencies();
  const app = await buildApp(deps);
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`IdentityHub backend listening on port ${env.PORT}`);
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error("Fatal error during startup:", error);
  process.exit(1);
});
