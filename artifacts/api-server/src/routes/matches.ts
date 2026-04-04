import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { matchesTable, matchParticipantsTable, matchPlayersTable, usersTable, squadMembersTable, hostEarningsTable, platformEarningsTable, followsTable, hostReviewsTable, referralsTable } from "@workspace/db/schema";
import { eq, and, ilike, or, sql, inArray, avg, count } from "drizzle-orm";
import { requireAuth } from "./auth";
import { notify } from "../lib/notify";

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
  let hasReviewed = false;
  if (userId) {
    const [follow] = await db.select().from(followsTable).where(
      and(eq(followsTable.followerId, userId), eq(followsTable.followingId, match.hostId))
    );
    isFollowingHost = !!follow;
    const [participation] = await db.select().from(matchParticipantsTable).where(
      and(eq(matchParticipantsTable.matchId, match.id), eq(matchParticipantsTable.userId, userId))
    );
    isJoined = !!participation;
    if (match.status === "completed" && isJoined) {
      const [existingReview] = await db.select().from(hostReviewsTable).where(
        and(eq(hostReviewsTable.matchId, match.id), eq(hostReviewsTable.reviewerId, userId))
      );
      hasReviewed = !!existingReview;
    }
  }

  const entryFee = parseFloat(match.entryFee as string);
  const showcasePrizePool = parseFloat((match.showcasePrizePool as string) ?? "0");
  const hostContribution = parseFloat((match.hostContribution as string) ?? "0");

  const entryFeePool = match.filledSlots * entryFee;
  const totalPool = entryFeePool + hostContribution;
  const isLargePool = match.filledSlots >= 8;
  const winnersPercent = isLargePool ? 0.85 : 0.90;
  const hostPercent = isLargePool ? 0.10 : 0.05;
  const platformPercent = 0.05;
  const livePrizePool = entryFeePool * winnersPercent + hostContribution;
  const hostCut = entryFeePool * hostPercent;
  const platformCut = entryFeePool * platformPercent;

  const result: any = {
    id: match.id,
    code: match.code,
    game: match.game,
    mode: match.mode,
    teamSize: match.teamSize,
    entryFee,
    showcasePrizePool,
    hostContribution,
    livePrizePool,
    hostCut,
    platformCut,
    totalPool,
    winnersPercent: Math.round(winnersPercent * 100),
    hostPercent: Math.round(hostPercent * 100),
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
    isRecommended: !isFollowingHost && !!host?.recommended,
    isJoined,
    roomReleased: match.roomReleased,
    description: match.description ?? null,
    thumbnailImage: match.thumbnailImage ?? null,
    hasReviewed,
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

  const conditions: any[] = [];
  if (status && status !== "all") conditions.push(eq(matchesTable.status, status as any));
  if (search) {
    conditions.push(or(
      ilike(matchesTable.code, `%${search}%`),
      ilike(matchesTable.game, `%${search}%`),
      ilike(matchesTable.mode, `%${search}%`)
    ));
  }

  // Players only see matches from hosts they follow + recommended hosts
  // If they follow no one and no recommended hosts exist, fall back to showing all matches
  if (user.role === "player") {
    const follows = await db.select({ followingId: followsTable.followingId })
      .from(followsTable).where(eq(followsTable.followerId, user.id));
    const followedIds = follows.map(f => f.followingId);

    const recommendedHosts = await db.select({ id: usersTable.id })
      .from(usersTable).where(and(eq(usersTable.role, "host"), eq(usersTable.recommended, true)));
    const recommendedIds = recommendedHosts.map(h => h.id);

    const allowedIds = [...new Set([...followedIds, ...recommendedIds])];
    if (allowedIds.length > 0) {
      conditions.push(inArray(matchesTable.hostId, allowedIds));
    }
    // If allowedIds is empty, show all matches so new users don't see a blank home page
  }

  const matches = conditions.length > 0
    ? await db.select().from(matchesTable).where(and(...conditions)).orderBy(matchesTable.createdAt)
    : await db.select().from(matchesTable).orderBy(matchesTable.createdAt);

  const serialized = await Promise.all(matches.map(m => serializeMatch(m, user.id)));
  res.json(serialized);
});

router.post("/matches", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (user.role !== "host" && user.role !== "admin") {
    res.status(403).json({ error: "Only hosts can create matches" });
    return;
  }
  const { game, mode, teamSize, entryFee, slots, startTime, showcasePrizePool, description, thumbnailImage, hostContribution } = req.body;
  if (!game || !mode || !startTime) {
    res.status(400).json({ error: "game, mode, and startTime are required" }); return;
  }
  const parsedTeamSize = Number(teamSize);
  const parsedSlots = Number(slots);
  const parsedEntryFee = Number(entryFee);
  if (!Number.isInteger(parsedTeamSize) || parsedTeamSize < 1 || parsedTeamSize > 100) {
    res.status(400).json({ error: "teamSize must be a positive integer" }); return;
  }
  if (!Number.isInteger(parsedSlots) || parsedSlots < 2 || parsedSlots > 10000) {
    res.status(400).json({ error: "slots must be between 2 and 10000" }); return;
  }
  if (isNaN(parsedEntryFee) || parsedEntryFee < 0) {
    res.status(400).json({ error: "entryFee must be a non-negative number" }); return;
  }
  const parsedStartTime = new Date(startTime);
  if (isNaN(parsedStartTime.getTime())) {
    res.status(400).json({ error: "Invalid startTime" }); return;
  }
  if (parsedStartTime <= new Date()) {
    res.status(400).json({ error: "startTime must be in the future" }); return;
  }

  const parsedContribution = hostContribution != null ? Number(hostContribution) : 0;
  if (isNaN(parsedContribution) || parsedContribution < 0) {
    res.status(400).json({ error: "hostContribution must be a non-negative number" }); return;
  }

  if (parsedContribution > 0) {
    const hostBalance = parseFloat(user.balance as string);
    if (hostBalance < parsedContribution) {
      res.status(400).json({ error: `Insufficient balance. You have ${hostBalance.toFixed(0)} GC but tried to contribute ${parsedContribution} GC.` }); return;
    }
  }

  const code = generateCode();
  let match: typeof matchesTable.$inferSelect;

  await db.transaction(async (tx) => {
    if (parsedContribution > 0) {
      await tx.execute(sql`UPDATE users SET balance = balance - ${parsedContribution} WHERE id = ${user.id}`);
    }
    const [inserted] = await tx.insert(matchesTable).values({
      code,
      game,
      mode,
      teamSize: parsedTeamSize,
      entryFee: String(parsedEntryFee),
      slots: parsedSlots,
      hostId: user.id,
      startTime: parsedStartTime,
      status: "upcoming",
      filledSlots: 0,
      showcasePrizePool: showcasePrizePool != null ? String(Number(showcasePrizePool)) : "0",
      hostContribution: String(parsedContribution),
      roomReleased: false,
      description: description ? String(description).trim() : null,
      thumbnailImage: thumbnailImage ? String(thumbnailImage).trim() : null,
    }).returning();
    match = inserted;
  });

  res.json(await serializeMatch(match!, user.id));
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
  if (match.status === "completed") {
    res.status(400).json({ error: "Cannot delete a completed match. Rewards have already been distributed." }); return;
  }
  // Refund all participants atomically
  await db.transaction(async (tx) => {
    const participants = await tx.select().from(matchParticipantsTable).where(eq(matchParticipantsTable.matchId, match.id));
    const fee = parseFloat(match.entryFee as string) * match.teamSize;
    for (const p of participants) {
      await tx.execute(sql`UPDATE users SET balance = balance + ${fee} WHERE id = ${p.userId}`);
    }
    await tx.delete(matchPlayersTable).where(eq(matchPlayersTable.matchId, match.id));
    await tx.delete(matchParticipantsTable).where(eq(matchParticipantsTable.matchId, match.id));
    await tx.delete(matchesTable).where(eq(matchesTable.id, match.id));
  });
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
    if (!players || players.length !== match.teamSize) {
      res.status(400).json({ error: `Provide exactly ${match.teamSize} players to join.` });
      return;
    }
    if (players.some((p: any) => !p.ign || !p.uid)) {
      res.status(400).json({ error: "All players must have an IGN and UID." });
      return;
    }
  }

  const totalFee = parseFloat(match.entryFee as string) * (match.teamSize > 1 ? match.teamSize : 1);

  try {
    await db.transaction(async (tx) => {
      const deductResult = await tx.execute(
        sql`UPDATE users SET balance = balance - ${totalFee} WHERE id = ${user.id} AND balance >= ${totalFee} RETURNING balance`
      );
      if (!deductResult.rows || deductResult.rows.length === 0) {
        throw new Error("Insufficient balance");
      }

      const slotResult = await tx.execute(
        sql`UPDATE matches SET filled_slots = filled_slots + ${match.teamSize}
        WHERE id = ${match.id} AND filled_slots + ${match.teamSize} <= slots
        RETURNING filled_slots`
      );
      if (!slotResult.rows || slotResult.rows.length === 0) {
        throw new Error("Match is full");
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

      const today = new Date().toISOString().slice(0, 10);
      if (totalFee > 0) {
        const newPaidMatchesResult = await tx.execute(
          sql`UPDATE users SET paid_matches_played = paid_matches_played + 1 WHERE id = ${user.id} RETURNING paid_matches_played`
        );
        const newPaidMatches = (newPaidMatchesResult.rows[0] as any)?.paid_matches_played as number;

        // Daily task: track paid matches today (reset free match counter if new day)
        const dailyResult = await tx.execute(
          sql`UPDATE users SET
            daily_paid_matches = CASE WHEN daily_task_date = ${today} THEN daily_paid_matches + 1 ELSE 1 END,
            daily_wins = CASE WHEN daily_task_date = ${today} THEN daily_wins ELSE 0 END,
            daily_task_date = ${today}
          WHERE id = ${user.id} RETURNING daily_paid_matches`
        );
        const todayPaidCount = (dailyResult.rows[0] as any)?.daily_paid_matches as number;
        // Award 1 Gold Coin when daily 3-paid-match task first completes
        if (todayPaidCount === 3) {
          await tx.execute(sql`UPDATE users SET balance = balance + 1 WHERE id = ${user.id}`);
        }

        if (newPaidMatches === 5) {
          const [referral] = await tx.select().from(referralsTable)
            .where(and(eq(referralsTable.referredId, user.id), eq(referralsTable.completed, false)));
          if (referral) {
            await tx.update(referralsTable).set({ completed: true, referrerRewarded: true })
              .where(eq(referralsTable.id, referral.id));
            // Referrer gets 3 Gold Coins
            await tx.execute(sql`UPDATE users SET balance = balance + 3 WHERE id = ${referral.referrerId}`);
            // Referred user gets +1 Gold Coin bonus on win task for 5 days
            const bonusUntil = new Date();
            bonusUntil.setDate(bonusUntil.getDate() + 5);
            const bonusUntilStr = bonusUntil.toISOString().slice(0, 10);
            await tx.execute(sql`UPDATE users SET referral_bonus_until = ${bonusUntilStr} WHERE id = ${user.id}`);
          }
        }
      } else {
        // Daily task: track free matches today (reset paid match counter if new day)
        const freeResult = await tx.execute(
          sql`UPDATE users SET
            daily_wins = CASE WHEN daily_task_date = ${today} THEN daily_wins + 1 ELSE 1 END,
            daily_paid_matches = CASE WHEN daily_task_date = ${today} THEN daily_paid_matches ELSE 0 END,
            daily_task_date = ${today}
          WHERE id = ${user.id} RETURNING daily_wins`
        );
        const todayFreeCount = (freeResult.rows[0] as any)?.daily_wins as number;
        // Award 1 Gold Coin when daily 3-free-match task first completes
        if (todayFreeCount === 3) {
          await tx.execute(sql`UPDATE users SET balance = balance + 1 WHERE id = ${user.id}`);
        }
      }
    });
  } catch (err: any) {
    const msg = err?.message;
    if (msg === "Insufficient balance" || msg === "Match is full") {
      res.status(400).json({ error: msg }); return;
    }
    throw err;
  }

  res.json({ success: true, message: "Joined successfully! Check the Room tab for credentials." });
  notify(match.hostId, "match_join", `A player joined your match ${match.code}! 🎮`, `/matches/${match.id}`).catch(() => {});
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

  const entryFeeNum = parseFloat(match.entryFee as string);
  const hostContributionNum = parseFloat((match.hostContribution as string) ?? "0");
  const entryFeePool = match.filledSlots * entryFeeNum;
  const totalPool = entryFeePool + hostContributionNum;
  const winnersPercent = match.filledSlots >= 8 ? 0.85 : 0.90;
  const hostPercent = match.filledSlots >= 8 ? 0.10 : 0.05;
  const maxWinnersPool = entryFeePool * winnersPercent + hostContributionNum;
  const hostCut = parseFloat((entryFeePool * hostPercent).toFixed(2));
  const totalReward = results.reduce((sum, r) => sum + r.reward, 0);
  if (totalReward > maxWinnersPool + 0.01) {
    res.status(400).json({ error: `Total rewards (${totalReward} GC) exceed the winners pool (${maxWinnersPool.toFixed(2)} GC)` }); return;
  }

  const today = new Date().toISOString().slice(0, 10);
  await db.transaction(async (tx) => {
    for (const r of results) {
      await tx.update(matchParticipantsTable).set({
        rank: r.rank,
        reward: String(r.reward),
      }).where(eq(matchParticipantsTable.id, r.participantId));

      if (r.reward > 0) {
        const winResult = await tx.execute(
          sql`UPDATE users SET
            balance = balance + ${r.reward},
            tournament_wins = tournament_wins + 1
          WHERE id = (SELECT user_id FROM match_participants WHERE id = ${r.participantId})
          RETURNING id, tournament_wins`
        );
        const winRow = winResult.rows[0] as any;
        // Award 100 Silver Coins milestone when tournament_wins reaches exactly 5
        if (winRow && winRow.tournament_wins === 5) {
          await tx.execute(sql`UPDATE users SET silver_coins = silver_coins + 100 WHERE id = ${winRow.id}`);
        }
      }
    }

    if (hostCut > 0) {
      await tx.execute(sql`UPDATE users SET balance = balance + ${hostCut} WHERE id = ${match.hostId}`);
      await tx.insert(hostEarningsTable).values({
        hostId: match.hostId,
        matchId: match.id,
        matchCode: match.code,
        amount: String(hostCut),
      });
    }

    const platformCut = parseFloat((totalPool * 0.05).toFixed(2));
    if (platformCut > 0) {
      await tx.insert(platformEarningsTable).values({
        hostId: match.hostId,
        matchId: match.id,
        matchCode: match.code,
        amount: String(platformCut),
      });
    }

    await tx.update(matchesTable).set({ status: "completed" }).where(eq(matchesTable.id, match.id));
  });

  res.json({ success: true, message: "Result submitted and rewards distributed!" });
  const participants = await db.select({ userId: matchParticipantsTable.userId, reward: matchParticipantsTable.reward })
    .from(matchParticipantsTable).where(eq(matchParticipantsTable.matchId, match.id));
  for (const p of participants) {
    const reward = p.reward ? parseFloat(p.reward as string) : 0;
    const msg = reward > 0
      ? `Match ${match.code} results are in! You won ₹${reward} 🏆`
      : `Match ${match.code} results are in. Better luck next time! 💪`;
    notify(p.userId, "match_result", msg, `/matches/${match.id}`).catch(() => {});
  }
});

router.get("/matches/:id/players", requireAuth, async (req: Request, res: Response) => {
  const requestingUser = (req as any).user;
  const matchId = Number(req.params.id);

  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, matchId));
  const canSeeFullUid = match && (requestingUser.role === "admin" || requestingUser.id === match.hostId);

  const participants = await db.select().from(matchParticipantsTable)
    .where(eq(matchParticipantsTable.matchId, matchId))
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
      players: players.map(pl => ({
        ign: pl.ign,
        uid: canSeeFullUid ? pl.uid : (pl.uid ? pl.uid.slice(0, 3) + "****" : "****"),
        position: pl.position,
      })),
    };
  }));
  res.json(result);
});

router.get("/my-matches", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;

  if (user.role === "host" || user.role === "admin") {
    const hostedMatches = await db.select().from(matchesTable).where(eq(matchesTable.hostId, user.id));
    const serialized = await Promise.all(hostedMatches.map(m => serializeMatch(m, user.id)));
    const participated = serialized.filter(m => m.status !== "completed");
    const history = serialized.filter(m => m.status === "completed");
    res.json({ participated, history });
    return;
  }

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

router.post("/matches/:id/review", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (user.role !== "player") {
    res.status(403).json({ error: "Only players can review hosts" }); return;
  }
  const matchId = parseInt(req.params.id);
  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, matchId));
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  if (match.status !== "completed") {
    res.status(400).json({ error: "Can only review completed matches" }); return;
  }
  const [participation] = await db.select().from(matchParticipantsTable).where(
    and(eq(matchParticipantsTable.matchId, matchId), eq(matchParticipantsTable.userId, user.id))
  );
  if (!participation) { res.status(403).json({ error: "You did not participate in this match" }); return; }
  const [existing] = await db.select().from(hostReviewsTable).where(
    and(eq(hostReviewsTable.matchId, matchId), eq(hostReviewsTable.reviewerId, user.id))
  );
  if (existing) { res.status(400).json({ error: "You have already reviewed this match" }); return; }
  const { rating, comment } = req.body;
  const parsedRating = parseInt(rating);
  if (!parsedRating || parsedRating < 1 || parsedRating > 5) {
    res.status(400).json({ error: "Rating must be between 1 and 5" }); return;
  }
  await db.insert(hostReviewsTable).values({
    matchId,
    reviewerId: user.id,
    hostId: match.hostId,
    rating: parsedRating,
    comment: comment?.trim() || null,
  });
  res.json({ success: true });
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
