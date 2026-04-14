import { createServer } from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { seedDefaults } from "@workspace/db/seed";
import { initSocketIO } from "./lib/socket";
import { db } from "@workspace/db";
import { groupMessagesTable, groupsTable, matchesTable, matchParticipantsTable } from "@workspace/db/schema";
import { eq, lt, and, isNull, gte, lte } from "drizzle-orm";
import { notify } from "./lib/notify";

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

async function sendMatchReminders() {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() + 14 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 31 * 60 * 1000);

    const upcomingMatches = await db
      .select({ id: matchesTable.id, code: matchesTable.code, game: matchesTable.game, startTime: matchesTable.startTime })
      .from(matchesTable)
      .where(
        and(
          eq(matchesTable.status, "upcoming"),
          isNull(matchesTable.reminderSentAt),
          gte(matchesTable.startTime, windowStart),
          lte(matchesTable.startTime, windowEnd),
        )
      );

    for (const match of upcomingMatches) {
      const participants = await db
        .select({ userId: matchParticipantsTable.userId })
        .from(matchParticipantsTable)
        .where(eq(matchParticipantsTable.matchId, match.id));

      const minutesLeft = Math.round((match.startTime.getTime() - now.getTime()) / 60000);
      const msg = `⏰ ${match.game} match (${match.code}) starts in ~${minutesLeft} minutes! Get ready.`;

      await Promise.allSettled(
        participants.map(p => notify(p.userId, "match_reminder", msg, `/matches/${match.id}`))
      );

      await db.update(matchesTable)
        .set({ reminderSentAt: now })
        .where(eq(matchesTable.id, match.id));

      if (participants.length > 0) {
        logger.info({ matchId: match.id, recipients: participants.length }, "Match start reminder sent");
      }
    }
  } catch (err) {
    logger.warn({ err }, "Match reminder job failed");
  }
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

  await sendMatchReminders();
  setInterval(sendMatchReminders, 5 * 60 * 1000);
}

main();
