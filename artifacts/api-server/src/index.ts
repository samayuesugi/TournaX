import { createServer } from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { seedDefaults } from "@workspace/db/seed";
import { initSocketIO } from "./lib/socket";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function main() {
  try {
    await seedDefaults();
  } catch (err) {
    logger.warn({ err }, "Seed skipped (database may not be ready yet)");
  }

  const httpServer = createServer(app);
  initSocketIO(httpServer);

  httpServer.listen(port, () => {
    logger.info({ port }, "Server listening");
  });
}

main();
