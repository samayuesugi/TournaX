import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { matchParticipantsTable, usersTable, matchesTable } from "@workspace/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { requireAuth } from "./auth";

const router: IRouter = Router();

router.get("/leaderboard", requireAuth, async (req: Request, res: Response) => {
  const { game, type = "wins" } = req.query;

  const players = await db.select().from(usersTable).where(eq(usersTable.role, "player"));

  const rows = await Promise.all(players.map(async (player) => {
    let participations;
    if (game && game !== "all") {
      const matchIds = (await db.select({ id: matchesTable.id }).from(matchesTable).where(eq(matchesTable.game, game as string))).map(m => m.id);
      if (matchIds.length === 0) {
        participations = [];
      } else {
        participations = await db.select().from(matchParticipantsTable)
          .where(and(
            eq(matchParticipantsTable.userId, player.id),
            sql`${matchParticipantsTable.matchId} = ANY(ARRAY[${sql.join(matchIds.map(id => sql`${id}`), sql`, `)}])`
          ));
      }
    } else {
      participations = await db.select().from(matchParticipantsTable)
        .where(eq(matchParticipantsTable.userId, player.id));
    }

    const totalMatches = participations.length;
    const wins = participations.filter(p => p.rank === 1).length;
    const totalEarnings = participations.reduce((sum, p) => sum + (p.reward ? parseFloat(p.reward as string) : 0), 0);

    return {
      id: player.id,
      name: player.name || `@${player.handle}`,
      handle: player.handle,
      avatar: player.avatar || "🔥",
      game: player.game,
      totalMatches,
      wins,
      totalEarnings,
    };
  }));

  let sorted;
  if (type === "earnings") {
    sorted = rows.sort((a, b) => b.totalEarnings - a.totalEarnings);
  } else if (type === "matches") {
    sorted = rows.sort((a, b) => b.totalMatches - a.totalMatches);
  } else {
    sorted = rows.sort((a, b) => b.wins - a.wins);
  }

  res.json(sorted.slice(0, 50).map((r, i) => ({ ...r, rank: i + 1 })));
});

export default router;
