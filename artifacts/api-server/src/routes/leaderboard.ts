import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { matchParticipantsTable, usersTable, matchesTable } from "@workspace/db/schema";
import { eq, sql, and, inArray, gte } from "drizzle-orm";
import { requireAuth } from "./auth";

const router: IRouter = Router();

router.get("/leaderboard", requireAuth, async (req: Request, res: Response) => {
  const { game, type = "wins", timeframe = "all", scope = "national", state } = req.query;

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

  const userConditions: any[] = [eq(usersTable.role, "player")];
  if (scope === "state" && state) {
    userConditions.push(eq(usersTable.state, state as string));
  }
  const userWhere = userConditions.length === 1 ? userConditions[0] : and(...userConditions);

  if (type === "trust") {
    const rows = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        handle: usersTable.handle,
        avatar: usersTable.avatar,
        game: usersTable.game,
        state: usersTable.state,
        city: usersTable.city,
        trustScore: usersTable.trustScore,
        trustTier: usersTable.trustTier,
        paidMatchesPlayed: usersTable.paidMatchesPlayed,
        tournamentWins: usersTable.tournamentWins,
      })
      .from(usersTable)
      .where(userWhere)
      .orderBy(sql`${usersTable.trustScore} DESC`)
      .limit(50);

    res.json(
      rows.map((r, i) => ({
        ...r,
        avatar: r.avatar || "🔥",
        rank: i + 1,
        totalMatches: r.paidMatchesPlayed ?? 0,
        wins: r.tournamentWins ?? 0,
        totalEarnings: 0,
      }))
    );
    return;
  }

  const rows = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      handle: usersTable.handle,
      avatar: usersTable.avatar,
      game: usersTable.game,
      state: usersTable.state,
      city: usersTable.city,
      trustScore: usersTable.trustScore,
      trustTier: usersTable.trustTier,
      totalMatches: sql<number>`count(${matchParticipantsTable.id})::int`,
      wins: sql<number>`count(case when ${matchParticipantsTable.rank} = 1 then 1 end)::int`,
      totalEarnings: sql<number>`coalesce(sum(${matchParticipantsTable.reward}::numeric), 0)`,
    })
    .from(usersTable)
    .leftJoin(matchParticipantsTable, participationCondition)
    .where(userWhere)
    .groupBy(
      usersTable.id,
      usersTable.name,
      usersTable.handle,
      usersTable.avatar,
      usersTable.game,
      usersTable.state,
      usersTable.city,
      usersTable.trustScore,
      usersTable.trustTier,
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

router.get("/leaderboard/states", requireAuth, async (req: Request, res: Response) => {
  const { game, type = "wins" } = req.query;

  const userConditions: any[] = [
    eq(usersTable.role, "player"),
    sql`${usersTable.state} IS NOT NULL`,
  ];
  const userWhere = and(...userConditions);

  if (type === "trust") {
    const rows = await db
      .select({
        state: usersTable.state,
        playerCount: sql<number>`count(*)::int`,
        avgTrust: sql<number>`avg(${usersTable.trustScore})::int`,
        topPlayer: sql<string>`(array_agg(${usersTable.name} ORDER BY ${usersTable.trustScore} DESC))[1]`,
        topAvatar: sql<string>`(array_agg(${usersTable.avatar} ORDER BY ${usersTable.trustScore} DESC))[1]`,
      })
      .from(usersTable)
      .where(userWhere)
      .groupBy(usersTable.state)
      .orderBy(sql`avg(${usersTable.trustScore}) DESC`)
      .limit(36);

    res.json(rows.map((r, i) => ({ ...r, rank: i + 1, score: r.avgTrust })));
    return;
  }

  const matchConditions: any[] = [];
  if (game && game !== "all") matchConditions.push(eq(matchesTable.game, game as string));

  let matchIds: number[] | null = null;
  if (matchConditions.length > 0) {
    const matchRows = await db.select({ id: matchesTable.id }).from(matchesTable).where(matchConditions[0]);
    matchIds = matchRows.map(m => m.id);
    if (matchIds.length === 0) { res.json([]); return; }
  }

  const participationCondition = matchIds !== null
    ? and(eq(matchParticipantsTable.userId, usersTable.id), inArray(matchParticipantsTable.matchId, matchIds))
    : eq(matchParticipantsTable.userId, usersTable.id);

  const rows = await db
    .select({
      state: usersTable.state,
      playerCount: sql<number>`count(DISTINCT ${usersTable.id})::int`,
      totalWins: sql<number>`count(case when ${matchParticipantsTable.rank} = 1 then 1 end)::int`,
      totalMatches: sql<number>`count(${matchParticipantsTable.id})::int`,
      totalEarnings: sql<number>`coalesce(sum(${matchParticipantsTable.reward}::numeric), 0)`,
      topPlayer: sql<string>`(array_agg(${usersTable.name} ORDER BY count(case when ${matchParticipantsTable.rank} = 1 then 1 end) DESC))[1]`,
      topAvatar: sql<string>`(array_agg(${usersTable.avatar} ORDER BY count(case when ${matchParticipantsTable.rank} = 1 then 1 end) DESC))[1]`,
    })
    .from(usersTable)
    .leftJoin(matchParticipantsTable, participationCondition)
    .where(userWhere)
    .groupBy(usersTable.state)
    .limit(36);

  let sorted;
  if (type === "earnings") sorted = rows.sort((a, b) => Number(b.totalEarnings) - Number(a.totalEarnings));
  else if (type === "matches") sorted = rows.sort((a, b) => b.totalMatches - a.totalMatches);
  else sorted = rows.sort((a, b) => b.totalWins - a.totalWins);

  res.json(sorted.slice(0, 36).map((r, i) => ({
    ...r,
    rank: i + 1,
    totalEarnings: Number(r.totalEarnings),
    score: type === "earnings" ? Number(r.totalEarnings) : type === "matches" ? r.totalMatches : r.totalWins,
  })));
});

export default router;
