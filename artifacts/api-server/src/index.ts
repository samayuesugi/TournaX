import { createServer } from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { seedDefaults } from "@workspace/db/seed";
import { initSocketIO } from "./lib/socket";
import { db } from "@workspace/db";
import { groupMessagesTable, groupsTable } from "@workspace/db/schema";
import { eq, lt, and } from "drizzle-orm";

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

async function cleanupOldMessages() {
  try {
    const groups = await db.select({ id: groupsTable.id, messageRetentionDays: groupsTable.messageRetentionDays }).from(groupsTable);
    let totalDeleted = 0;
    for (const group of groups) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - group.messageRetentionDays);
      const result = await db.delete(groupMessagesTable)
        .where(and(eq(groupMessagesTable.groupId, group.id), lt(groupMessagesTable.createdAt, cutoff)))
        .returning({ id: groupMessagesTable.id });
      totalDeleted += result.length;
    }
    if (totalDeleted > 0) {
      logger.info({ deleted: totalDeleted }, "Cleaned up expired group messages");
    }
  } catch (err) {
    logger.warn({ err }, "Message cleanup failed");
  }
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

  await cleanupOldMessages();
  setInterval(cleanupOldMessages, 6 * 60 * 60 * 1000);
}

main();
