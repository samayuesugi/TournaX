import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { matchParticipantsTable, usersTable, matchesTable } from "@workspace/db/schema";
import { eq, sql, and, inArray, gte } from "drizzle-orm";
import { requireAuth } from "./auth";

const router: IRouter = Router();

router.get("/leaderboard", requireAuth, async (req: Request, res: Response) => {
  const { game, type = "wins", timeframe = "all" } = req.query;

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  let matchIds: number[] | null = null;
  const matchConditions: any[] = [];
  if (game && game !== "all") {
    matchConditions.push(eq(matchesTable.game, game as string));
  }
  if (timeframe === "week") {
    matchConditions.push(gte(matchesTable.createdAt, weekAgo));
  }

  if (matchConditions.length > 0) {
    const matchRows = await db
      .select({ id: matchesTable.id })
      .from(matchesTable)
      .where(matchConditions.length === 1 ? matchConditions[0] : and(...matchConditions));
    matchIds = matchRows.map((m) => m.id);
    if (matchIds.length === 0) {
      res.json([]);
      return;
    }
  }

  const participationCondition =
    matchIds !== null
      ? and(
          eq(matchParticipantsTable.userId, usersTable.id),
          inArray(matchParticipantsTable.matchId, matchIds)
        )
      : eq(matchParticipantsTable.userId, usersTable.id);

  const rows = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      handle: usersTable.handle,
      avatar: usersTable.avatar,
      game: usersTable.game,
      totalMatches: sql<number>`count(${matchParticipantsTable.id})::int`,
      wins: sql<number>`count(case when ${matchParticipantsTable.rank} = 1 then 1 end)::int`,
      totalEarnings: sql<number>`coalesce(sum(${matchParticipantsTable.reward}::numeric), 0)`,
    })
    .from(usersTable)
    .leftJoin(matchParticipantsTable, participationCondition)
    .where(eq(usersTable.role, "player"))
    .groupBy(
      usersTable.id,
      usersTable.name,
      usersTable.handle,
      usersTable.avatar,
      usersTable.game
    );

  let sorted;
  if (type === "earnings") {
    sorted = rows.sort((a, b) => Number(b.totalEarnings) - Number(a.totalEarnings));
  } else if (type === "matches") {
    sorted = rows.sort((a, b) => b.totalMatches - a.totalMatches);
  } else {
    sorted = rows.sort((a, b) => b.wins - a.wins);
  }

  res.json(
    sorted.slice(0, 50).map((r, i) => ({
      ...r,
      avatar: r.avatar || "🔥",
      totalEarnings: Number(r.totalEarnings),
      rank: i + 1,
    }))
  );
});

export default router;
