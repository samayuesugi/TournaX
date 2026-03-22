import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { matchesTable, matchParticipantsTable, matchPlayersTable, usersTable, squadMembersTable } from "@workspace/db/schema";
import { eq, and, ilike, or, sql } from "drizzle-orm";
import { requireAuth } from "./auth";

const router: IRouter = Router();

function generateCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "TX";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function serializeMatch(match: typeof matchesTable.$inferSelect, userId?: number) {
  const [host] = await db.select().from(usersTable).where(eq(usersTable.id, match.hostId));
  let isFollowingHost = false;
  let isJoined = false;
  if (userId) {
    const { followsTable } = await import("@workspace/db/schema");
    const [follow] = await db.select().from(followsTable).where(
      and(eq(followsTable.followerId, userId), eq(followsTable.followingId, match.hostId))
    );
    isFollowingHost = !!follow;
    const [participation] = await db.select().from(matchParticipantsTable).where(
      and(eq(matchParticipantsTable.matchId, match.id), eq(matchParticipantsTable.userId, userId))
    );
    isJoined = !!participation;
  }

  const entryFee = parseFloat(match.entryFee as string);
  const fixedPrize = match.fixedPrize ? parseFloat(match.fixedPrize as string) : null;
  const prizeType = (match.prizeType as string) || "dynamic";
  const livePrizePool = prizeType === "fixed"
    ? (fixedPrize ?? 0)
    : match.filledSlots * entryFee * 0.8;
  const maxPrizePool = prizeType === "fixed"
    ? (fixedPrize ?? 0)
    : match.slots * entryFee * 0.8;

  const result: any = {
    id: match.id,
    code: match.code,
    game: match.game,
    mode: match.mode,
    teamSize: match.teamSize,
    entryFee,
    prizePool: parseFloat(match.prizePool as string),
    prizeType,
    fixedPrize,
    livePrizePool,
    maxPrizePool,
    startTime: match.startTime?.toISOString(),
    status: match.status,
    slots: match.slots,
    filledSlots: match.filledSlots,
    hostId: match.hostId,
    hostHandle: host?.handle || "@host",
    hostName: host?.name || "Host",
    hostAvatar: host?.avatar || "🛡️",
    hostFollowers: host?.followersCount || 0,
    isFollowingHost,
    isJoined,
    roomReleased: match.roomReleased,
  };
  if (isJoined && match.roomReleased) {
    result.roomId = match.roomId;
    result.roomPassword = match.roomPassword;
  }
  return result;
}

router.get("/matches", requireAuth, async (req: Request, res: Response) => {
  const { search, status } = req.query;
  const user = (req as any).user;

  let query = db.select().from(matchesTable);
  const conditions = [];
  if (status && status !== "all") conditions.push(eq(matchesTable.status, status as any));
  if (search) {
    conditions.push(or(
      ilike(matchesTable.code, `%${search}%`),
      ilike(matchesTable.game, `%${search}%`),
      ilike(matchesTable.mode, `%${search}%`)
    ));
  }
  const matches = conditions.length > 0
    ? await query.where(and(...conditions)).orderBy(matchesTable.createdAt)
    : await query.orderBy(matchesTable.createdAt);

  const serialized = await Promise.all(matches.map(m => serializeMatch(m, user.id)));
  res.json(serialized);
});

router.post("/matches", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (user.role !== "host" && user.role !== "admin") {
    res.status(403).json({ error: "Only hosts can create matches" });
    return;
  }
  const { game, mode, teamSize, entryFee, slots, startTime, prizeType, fixedPrize } = req.body;
  const isPrizeFixed = prizeType === "fixed" && fixedPrize != null;
  const code = generateCode();
  const [match] = await db.insert(matchesTable).values({
    code,
    game,
    mode,
    teamSize: Number(teamSize),
    entryFee: String(entryFee),
    slots: Number(slots),
    hostId: user.id,
    startTime: new Date(startTime),
    status: "upcoming",
    filledSlots: 0,
    prizePool: isPrizeFixed ? String(fixedPrize) : "0",
    prizeType: isPrizeFixed ? "fixed" : "dynamic",
    fixedPrize: isPrizeFixed ? String(fixedPrize) : null,
    roomReleased: false,
  }).returning();

  res.json(await serializeMatch(match, user.id));
});

router.get("/matches/:id", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, Number(req.params.id)));
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  
  const serialized = await serializeMatch(match, user.id);
  // If host viewing their own match, show full room credentials
  if (match.hostId === user.id || user.role === "admin") {
    serialized.roomId = match.roomId;
    serialized.roomPassword = match.roomPassword;
  }
  res.json(serialized);
});

router.delete("/matches/:id", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, Number(req.params.id)));
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  if (match.hostId !== user.id && user.role !== "admin") {
    res.status(403).json({ error: "Unauthorized" }); return;
  }
  // Refund all participants
  const participants = await db.select().from(matchParticipantsTable).where(eq(matchParticipantsTable.matchId, match.id));
  for (const p of participants) {
    const fee = parseFloat(match.entryFee as string) * match.teamSize;
    await db.execute(sql`UPDATE users SET balance = balance + ${fee} WHERE id = ${p.userId}`);
  }
  await db.delete(matchPlayersTable).where(eq(matchPlayersTable.matchId, match.id));
  await db.delete(matchParticipantsTable).where(eq(matchParticipantsTable.matchId, match.id));
  await db.delete(matchesTable).where(eq(matchesTable.id, match.id));
  res.json({ success: true, message: "Match deleted and refunds processed" });
});

router.post("/matches/:id/join", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, Number(req.params.id)));
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  if (match.status !== "upcoming") { res.status(400).json({ error: "Match is not joinable" }); return; }

  const existing = await db.select().from(matchParticipantsTable).where(
    and(eq(matchParticipantsTable.matchId, match.id), eq(matchParticipantsTable.userId, user.id))
  );
  if (existing.length > 0) { res.status(400).json({ error: "Already joined" }); return; }

  const { teamName, players } = req.body;

  if (match.teamSize > 1) {
    const squadMembers = await db.select().from(squadMembersTable).where(eq(squadMembersTable.userId, user.id));
    if (squadMembers.length < match.teamSize) {
      res.status(400).json({
        error: `You need at least ${match.teamSize} squad members to join this match. You have ${squadMembers.length}. Add more members in your Profile → My Squad.`
      });
      return;
    }
    if (!players || players.length !== match.teamSize) {
      res.status(400).json({ error: `Select exactly ${match.teamSize} players from your squad to join.` });
      return;
    }
  }

  const totalFee = parseFloat(match.entryFee as string) * (match.teamSize > 1 ? match.teamSize : 1);

  const isFixed = match.prizeType === "fixed";
  const entryFeeNum = parseFloat(match.entryFee as string);

  let joinError: string | null = null;
  await db.transaction(async (tx) => {
    const deductResult = await tx.execute(
      sql`UPDATE users SET balance = balance - ${totalFee} WHERE id = ${user.id} AND balance >= ${totalFee} RETURNING balance`
    );
    if (!deductResult.rows || deductResult.rows.length === 0) {
      joinError = "Insufficient balance";
      return;
    }

    const slotResult = await tx.execute(
      sql`UPDATE matches SET
        filled_slots = filled_slots + ${match.teamSize},
        prize_pool = CASE WHEN ${isFixed} THEN prize_pool
                          ELSE ((filled_slots + ${match.teamSize}) * ${entryFeeNum} * 0.8)::numeric
                     END
      WHERE id = ${match.id} AND filled_slots + ${match.teamSize} <= slots
      RETURNING filled_slots`
    );
    if (!slotResult.rows || slotResult.rows.length === 0) {
      joinError = "Match is full";
      return;
    }

    const newFilledSlots = (slotResult.rows[0] as any).filled_slots as number;
    const teamNumber = Math.ceil(newFilledSlots / match.teamSize);

    const [participant] = await tx.insert(matchParticipantsTable).values({
      matchId: match.id,
      userId: user.id,
      teamName: teamName || null,
      teamNumber,
    }).returning();

    const playerList = players || [{ ign: user.name || user.email, uid: user.gameUid || "0" }];
    for (let i = 0; i < playerList.length; i++) {
      await tx.insert(matchPlayersTable).values({
        participantId: participant.id,
        matchId: match.id,
        ign: playerList[i].ign,
        uid: playerList[i].uid,
        position: i + 1,
      });
    }
  });

  if (joinError === "Insufficient balance") {
    res.status(400).json({ error: joinError }); return;
  }
  if (joinError === "Match is full") {
    res.status(400).json({ error: joinError }); return;
  }

  res.json({ success: true, message: "Joined successfully! Check the Room tab for credentials." });
});

router.put("/matches/:id/room", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, Number(req.params.id)));
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  if (match.hostId !== user.id && user.role !== "admin") {
    res.status(403).json({ error: "Unauthorized" }); return;
  }
  const { roomId, roomPassword } = req.body;
  await db.update(matchesTable).set({
    roomId,
    roomPassword,
    roomReleased: true,
  }).where(eq(matchesTable.id, match.id));
  res.json({ success: true, message: "Room credentials updated" });
});

router.post("/matches/:id/go-live", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, Number(req.params.id)));
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  if (match.hostId !== user.id && user.role !== "admin") {
    res.status(403).json({ error: "Unauthorized" }); return;
  }
  await db.update(matchesTable).set({ status: "live" }).where(eq(matchesTable.id, match.id));
  res.json({ success: true, message: "Match is now live" });
});

router.post("/matches/:id/submit-result", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, Number(req.params.id)));
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  if (match.hostId !== user.id && user.role !== "admin") {
    res.status(403).json({ error: "Unauthorized" }); return;
  }
  if (match.status === "completed") {
    res.status(400).json({ error: "Result already submitted" }); return;
  }

  const { results } = req.body as {
    results: { participantId: number; rank: number; reward: number }[];
  };
  if (!Array.isArray(results) || results.length === 0) {
    res.status(400).json({ error: "Results are required" }); return;
  }

  const prizePool = parseFloat(match.prizePool as string);
  const totalReward = results.reduce((sum, r) => sum + r.reward, 0);
  if (totalReward > prizePool + 0.01) {
    res.status(400).json({ error: `Total rewards (₹${totalReward}) exceed the prize pool (₹${prizePool})` }); return;
  }

  await db.transaction(async (tx) => {
    for (const r of results) {
      await tx.update(matchParticipantsTable).set({
        rank: r.rank,
        reward: String(r.reward),
      }).where(eq(matchParticipantsTable.id, r.participantId));

      if (r.reward > 0) {
        await tx.execute(
          sql`UPDATE users SET balance = balance + ${r.reward} WHERE id = (
            SELECT user_id FROM match_participants WHERE id = ${r.participantId}
          )`
        );
      }
    }
    await tx.update(matchesTable).set({ status: "completed" }).where(eq(matchesTable.id, match.id));
  });

  res.json({ success: true, message: "Result submitted and rewards distributed!" });
});

router.get("/matches/:id/players", requireAuth, async (req: Request, res: Response) => {
  const participants = await db.select().from(matchParticipantsTable)
    .where(eq(matchParticipantsTable.matchId, Number(req.params.id)))
    .orderBy(matchParticipantsTable.teamNumber);

  const result = await Promise.all(participants.map(async (p) => {
    const players = await db.select().from(matchPlayersTable)
      .where(eq(matchPlayersTable.participantId, p.id))
      .orderBy(matchPlayersTable.position);
    return {
      id: p.id,
      teamName: p.teamName,
      teamNumber: p.teamNumber,
      rank: p.rank ?? null,
      reward: p.reward ? parseFloat(p.reward as string) : null,
      players: players.map(pl => ({ ign: pl.ign, uid: pl.uid, position: pl.position })),
    };
  }));
  res.json(result);
});

router.get("/my-matches", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const participations = await db.select().from(matchParticipantsTable)
    .where(eq(matchParticipantsTable.userId, user.id));

  const allMatches = await Promise.all(participations.map(async (p) => {
    const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, p.matchId));
    if (!match) return null;
    const serialized = await serializeMatch(match, user.id);
    return serialized;
  }));

  const validMatches = allMatches.filter(Boolean);
  const participated = validMatches.filter(m => m!.status !== "completed");
  const history = validMatches.filter(m => m!.status === "completed");
  res.json({ participated, history });
});

router.get("/admin/matches", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
  const { status } = req.query;
  let matches;
  if (status && status !== "all") {
    matches = await db.select().from(matchesTable).where(eq(matchesTable.status, status as any));
  } else {
    matches = await db.select().from(matchesTable);
  }
  const serialized = await Promise.all(matches.map(m => serializeMatch(m, user.id)));
  res.json(serialized);
});

export default router;
