import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { matchesTable, matchParticipantsTable, matchPlayersTable, usersTable, squadMembersTable, hostEarningsTable, platformEarningsTable, followsTable, hostReviewsTable, hostRatingsTable, referralsTable, tournamentBracketsTable, matchEscrowTransactionsTable, trustScoreEventsTable, groupsTable, groupMembersTable } from "@workspace/db/schema";
import { eq, and, ilike, or, sql, inArray, avg, count } from "drizzle-orm";
import { requireAuth } from "./auth";
import { notify } from "../lib/notify";
import { getIO } from "../lib/socket";

const router: IRouter = Router();

function generateCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "TX";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function getTrustTier(score: number): string {
  if (score < 300) return "Risky";
  if (score < 500) return "Beginner";
  if (score < 700) return "Trusted";
  if (score < 900) return "Veteran";
  return "Elite";
}

function getHostBadge(matchesHosted: number, avgRating: number): string {
  if (matchesHosted < 5) return "New Host";
  if (avgRating < 3) return "Flagged Host";
  if (matchesHosted >= 50 && avgRating >= 4.8) return "Elite Organizer";
  if (matchesHosted >= 20 && avgRating >= 4.5) return "Trusted Organizer";
  if (matchesHosted >= 5 && avgRating >= 4) return "Verified Organizer";
  return "New Host";
}

async function addTrustScoreEvent(tx: any, userId: number, eventType: string, pointChange: number, reason: string, matchId?: number) {
  const [current] = await tx.select({ trustScore: usersTable.trustScore }).from(usersTable).where(eq(usersTable.id, userId));
  const nextScore = Math.max(0, Math.min(1000, Number(current?.trustScore ?? 500) + pointChange));
  await tx.update(usersTable).set({ trustScore: nextScore, trustTier: getTrustTier(nextScore) }).where(eq(usersTable.id, userId));
  await tx.insert(trustScoreEventsTable).values({ userId, eventType, pointChange, reason, matchId: matchId ?? null });
}

async function recomputeHostRating(tx: any, hostId: number) {
  const ratings = await tx.select().from(hostRatingsTable).where(eq(hostRatingsTable.hostId, hostId));
  const avgRating = ratings.length ? ratings.reduce((sum: number, rating: typeof hostRatingsTable.$inferSelect) => sum + rating.overallRating, 0) / ratings.length : 0;
  const hostedMatches = await tx.select({ id: matchesTable.id }).from(matchesTable).where(and(eq(matchesTable.hostId, hostId), eq(matchesTable.status, "completed")));
  await tx.update(usersTable).set({
    hostRatingAvg: avgRating.toFixed(2),
    hostRatingCount: ratings.length,
    hostBadge: getHostBadge(hostedMatches.length, avgRating),
  }).where(eq(usersTable.id, hostId));
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
  const hostStake = parseFloat(((match as any).hostStake as string) ?? "0");
  const hostCommissionPercent = parseFloat(((match as any).hostCommissionPercent as string) ?? "10");
  const escrowBalance = parseFloat(((match as any).escrowBalance as string) ?? "0");

  const entryFeePool = match.filledSlots * entryFee;
  const totalPool = entryFeePool + hostContribution;
  const isLargePool = match.filledSlots >= 8;
  const winnersPercent = isLargePool ? 0.85 : 0.90;
  const hostPercent = hostCommissionPercent / 100;
  const platformPercent = 0.05;
  const livePrizePool = entryFeePool * winnersPercent + hostContribution;
  const hostCut = entryFeePool * hostPercent;
  const platformCut = entryFeePool * platformPercent;

  const [ratingRow] = await db
    .select({ avgRating: avg(hostReviewsTable.rating), totalReviews: count() })
    .from(hostReviewsTable)
    .where(eq(hostReviewsTable.hostId, match.hostId));

  const hostRating = ratingRow?.avgRating ? parseFloat(ratingRow.avgRating as string) : null;
  const hostReviewCount = Number(ratingRow?.totalReviews ?? 0);

  let rewardDistribution: any = null;
  if ((match as any).rewardDistribution) {
    try { rewardDistribution = JSON.parse((match as any).rewardDistribution); } catch {}
  }

  let resultScreenshotUrls: string[] = [];
  if ((match as any).resultScreenshotUrls) {
    try { resultScreenshotUrls = JSON.parse((match as any).resultScreenshotUrls); } catch {}
  }

  const result: any = {
    id: match.id,
    code: match.code,
    game: match.game,
    mode: match.mode,
    category: match.category ?? null,
    map: match.map ?? null,
    isEsportsOnly: (match as any).isEsportsOnly ?? false,
    teamSize: match.teamSize,
    entryFee,
    showcasePrizePool,
    hostContribution,
    hostStake,
    hostCommissionPercent,
    escrowBalance,
    escrowStatus: (match as any).escrowStatus ?? "pending",
    prizeDistributedAt: (match as any).prizeDistributedAt ? (match as any).prizeDistributedAt.toISOString() : null,
    minTrustScore: (match as any).minTrustScore ?? 0,
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
    hostRating: host?.hostRatingCount ? parseFloat((host.hostRatingAvg as string) ?? "0") : hostRating,
    hostReviewCount: host?.hostRatingCount ?? hostReviewCount,
    hostBadge: host?.hostBadge ?? "New Host",
    isFollowingHost,
    isRecommended: !isFollowingHost && !!host?.recommended,
    isJoined,
    roomReleased: match.roomReleased,
    description: match.description ?? null,
    thumbnailImage: match.thumbnailImage ?? null,
    hasReviewed,
    rewardDistribution,
    resultScreenshotUrls,
    screenshotUploadedAt: (match as any).screenshotUploadedAt ? (match as any).screenshotUploadedAt.toISOString() : null,
    streamLink: (match as any).streamLink ?? null,
    customRules: (match as any).customRules ? JSON.parse((match as any).customRules) : [],
    groupId: (match as any).groupId ?? null,
  };
  if (isJoined && match.roomReleased) {
    result.roomId = match.roomId;
    result.roomPassword = match.roomPassword;
  }
  return result;
}

router.get("/matches", requireAuth, async (req: Request, res: Response) => {
  const { search, status, game, category, teamSize, map: mapFilter, paid } = req.query;
  const user = (req as any).user;

  const conditions: any[] = [];
  if (status && status !== "all") conditions.push(eq(matchesTable.status, status as any));
  if (game) {
    conditions.push(ilike(matchesTable.game, game as string));
  } else if (user.game && user.role === "player") {
    conditions.push(ilike(matchesTable.game, user.game));
  }
  if (category) conditions.push(ilike(matchesTable.category, category as string));
  if (teamSize) conditions.push(eq(matchesTable.teamSize, Number(teamSize)));
  if (mapFilter) conditions.push(ilike(matchesTable.map, mapFilter as string));
  if (paid === "free") conditions.push(eq(matchesTable.entryFee, "0"));
  if (paid === "paid") conditions.push(sql`CAST(${matchesTable.entryFee} AS NUMERIC) > 0`);
  if (search) {
    conditions.push(or(
      ilike(matchesTable.code, `%${search}%`),
      ilike(matchesTable.game, `%${search}%`),
      ilike(matchesTable.mode, `%${search}%`),
      ilike(matchesTable.category, `%${search}%`)
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

    // Esports-only matches are only visible to esports-verified players
    if (!user.isEsportsPlayer) {
      conditions.push(eq(matchesTable.isEsportsOnly, false));
    }
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
  const { game, mode, teamSize, entryFee, slots, startTime, showcasePrizePool, description, thumbnailImage, hostContribution, hostStake, minTrustScore, category, map: matchMap, rewardDistribution, isEsportsOnly, streamLink, customRules } = req.body;
  const resolvedGame = game || user.game;
  if (!resolvedGame || !mode || !startTime) {
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
  const parsedHostStake = hostStake != null ? Number(hostStake) : parsedContribution;
  const parsedMinTrustScore = minTrustScore != null ? Number(minTrustScore) : 0;
  if (isNaN(parsedContribution) || parsedContribution < 0 || isNaN(parsedHostStake) || parsedHostStake < 0) {
    res.status(400).json({ error: "host stake must be a non-negative number" }); return;
  }
  if (!Number.isInteger(parsedMinTrustScore) || parsedMinTrustScore < 0 || parsedMinTrustScore > 1000) {
    res.status(400).json({ error: "minTrustScore must be between 0 and 1000" }); return;
  }

  if (parsedHostStake > 0) {
    const hostBalance = parseFloat(user.balance as string);
    if (hostBalance < parsedHostStake) {
      res.status(400).json({ error: `Insufficient balance. You have ${hostBalance.toFixed(0)} GC but tried to stake ${parsedHostStake} GC.` }); return;
    }
  }

  const code = generateCode();
  let match: typeof matchesTable.$inferSelect;

  await db.transaction(async (tx) => {
    if (parsedHostStake > 0) {
      await tx.execute(sql`UPDATE users SET balance = balance - ${parsedHostStake} WHERE id = ${user.id}`);
    }
    const [inserted] = await tx.insert(matchesTable).values({
      code,
      game: resolvedGame,
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
      hostStake: String(parsedHostStake),
      escrowBalance: String(parsedHostStake),
      hostCommissionPercent: "10",
      escrowStatus: parsedHostStake > 0 ? "locked" : "pending",
      minTrustScore: parsedMinTrustScore,
      roomReleased: false,
      description: description ? String(description).trim() : null,
      thumbnailImage: thumbnailImage ? String(thumbnailImage).trim() : null,
      category: category ? String(category).trim() : null,
      map: matchMap ? String(matchMap).trim() : null,
      rewardDistribution: rewardDistribution ? JSON.stringify(rewardDistribution) : null,
      isEsportsOnly: isEsportsOnly === true || isEsportsOnly === "true",
      streamLink: streamLink ? String(streamLink).trim() : null,
      customRules: customRules && Array.isArray(customRules) && customRules.length > 0 ? JSON.stringify(customRules) : null,
    } as any).returning();
    match = inserted;
    if (parsedHostStake > 0) {
      await tx.insert(matchEscrowTransactionsTable).values({
        matchId: inserted.id,
        userId: user.id,
        type: "host_stake",
        amount: String(parsedHostStake),
      });
    }
  });

  try {
    const [group] = await db.insert(groupsTable).values({
      name: `Match ${match!.code}`,
      avatar: "🎮",
      type: "match",
      createdBy: user.id,
      maxMembers: match!.slots + 1,
      messageRetentionDays: 3,
      isPublic: false,
    }).returning();
    await db.insert(groupMembersTable).values({ groupId: group.id, userId: user.id });
    await db.update(matchesTable).set({ groupId: group.id } as any).where(eq(matchesTable.id, match!.id));
    (match as any).groupId = group.id;
  } catch {}

  const serialized = await serializeMatch(match!, user.id);
  try { getIO().emit("match:new", { id: match!.id }); } catch {}
  res.json(serialized);

  const followers = await db.select({ followerId: followsTable.followerId })
    .from(followsTable).where(eq(followsTable.followingId, user.id));
  const hostName = user.name || `@${user.handle}`;
  const feeText = parsedEntryFee > 0 ? `Entry: ${parsedEntryFee} GC` : "Free Entry";
  const notifMsg = `🎮 ${hostName} ne ek naya match banaya! ${resolvedGame} · ${feeText} · Prize: ${serialized.showcasePrizePool?.toFixed(0) ?? "0"} GC`;
  for (const f of followers) {
    notify(f.followerId, "host_match_new", notifMsg, `/matches/${match!.id}`).catch(() => {});
  }
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
      if (fee > 0) {
        await tx.insert(matchEscrowTransactionsTable).values({
          matchId: match.id,
          userId: p.userId,
          type: "refund",
          amount: String(fee),
        });
      }
    }
    const hostStake = parseFloat(((match as any).hostStake as string) ?? "0");
    if (hostStake > 0) {
      await tx.execute(sql`UPDATE users SET balance = balance + ${hostStake} WHERE id = ${match.hostId}`);
      await tx.insert(matchEscrowTransactionsTable).values({
        matchId: match.id,
        userId: match.hostId,
        type: "refund",
        amount: String(hostStake),
      });
    }
    await tx.delete(matchPlayersTable).where(eq(matchPlayersTable.matchId, match.id));
    await tx.delete(matchParticipantsTable).where(eq(matchParticipantsTable.matchId, match.id));
    await tx.delete(matchesTable).where(eq(matchesTable.id, match.id));
  });
  try { getIO().emit("match:deleted", { id: match.id }); } catch {}
  res.json({ success: true, message: "Match deleted and refunds processed" });
});

router.post("/matches/:id/join", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, Number(req.params.id)));
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  if (match.status !== "upcoming") { res.status(400).json({ error: "Match is not joinable" }); return; }
  if (((match as any).minTrustScore ?? 0) > (user.trustScore ?? 500)) {
    res.status(403).json({ error: `This match requires ${((match as any).minTrustScore ?? 0)}+ Trust Score. Your score is ${user.trustScore ?? 500}.` }); return;
  }

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

  const submittedUids: string[] = players
    ? players.map((p: any) => String(p.uid).trim())
    : [String(req.body.uid || user.gameUid || "").trim()].filter(Boolean);

  const entryFeeCents = Math.round(parseFloat(match.entryFee as string) * 100);
  const totalFeeCents = entryFeeCents * (match.teamSize > 1 ? match.teamSize : 1);
  const totalFee = totalFeeCents / 100;

  try {
    await db.transaction(async (tx) => {
      if (submittedUids.length > 0) {
        const existingPlayers = await tx
          .select({ uid: matchPlayersTable.uid })
          .from(matchPlayersTable)
          .where(eq(matchPlayersTable.matchId, match.id));

        const takenUids = new Set(existingPlayers.map((p) => String(p.uid).trim()));
        const duplicateUid = submittedUids.find((uid) => takenUids.has(uid));
        if (duplicateUid) {
          throw new Error(`UID "${duplicateUid}" is already registered in this match.`);
        }
      }

      const deductResult = await tx.execute(
        sql`UPDATE users SET balance = balance - ${totalFee} WHERE id = ${user.id} AND balance >= ${totalFee} RETURNING balance`
      );
      if (!deductResult.rows || deductResult.rows.length === 0) {
        throw new Error("Insufficient balance");
      }

      const slotResult = await tx.execute(
        sql`UPDATE matches SET filled_slots = filled_slots + ${match.teamSize}, escrow_balance = escrow_balance + ${totalFee}
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

      const playerList = players || [{ ign: user.name || user.email, uid: user.gameUid || `user-${user.id}` }];
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
        await tx.insert(matchEscrowTransactionsTable).values({
          matchId: match.id,
          userId: user.id,
          type: "entry_fee",
          amount: String(totalFee),
        });
      }
      await addTrustScoreEvent(tx, user.id, "match_joined", 10, "Joined a tournament match", match.id);
      if (totalFee > 0) {
        await addTrustScoreEvent(tx, user.id, "match_fee_paid", 30, "Entry fee paid on time", match.id);
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
        // Award 10 Silver Coins when daily 3-paid-match task first completes
        if (todayPaidCount === 3) {
          await tx.execute(sql`UPDATE users SET silver_coins = silver_coins + 10 WHERE id = ${user.id}`);
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
        // Award 10 Silver Coins when daily 3-free-match task first completes
        if (todayFreeCount === 3) {
          await tx.execute(sql`UPDATE users SET silver_coins = silver_coins + 10 WHERE id = ${user.id}`);
        }
      }
    });
  } catch (err: any) {
    const msg = err?.message;
    if (msg === "Insufficient balance" || msg === "Match is full") {
      res.status(400).json({ error: msg }); return;
    }
    if (msg?.includes("is already registered in this match")) {
      res.status(400).json({ error: msg }); return;
    }
    throw err;
  }

  if ((match as any).groupId) {
    try {
      const alreadyMember = await db.select().from(groupMembersTable)
        .where(and(eq(groupMembersTable.groupId, (match as any).groupId), eq(groupMembersTable.userId, user.id)));
      if (alreadyMember.length === 0) {
        await db.insert(groupMembersTable).values({ groupId: (match as any).groupId, userId: user.id });
      }
    } catch {}
  }

  res.json({ success: true, message: "Joined successfully! Check the Room tab for credentials.", groupId: (match as any).groupId ?? null });
  try { getIO().emit("match:updated", { id: match.id }); } catch {}
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

  const participants = await db
    .select({ userId: matchParticipantsTable.userId })
    .from(matchParticipantsTable)
    .where(eq(matchParticipantsTable.matchId, match.id));

  const matchLabel = match.code || `Match #${match.id}`;
  const notifMsg = `🎮 Room is ready for "${matchLabel}"! Room ID: ${roomId}${roomPassword ? ` | Password: ${roomPassword}` : ""} — Join now!`;

  await Promise.allSettled(
    participants.map((p) =>
      notify(p.userId, "room_ready", notifMsg, `/matches/${match.id}`)
    )
  );

  res.json({ success: true, message: "Room credentials updated" });
  try { getIO().emit("match:updated", { id: match.id }); } catch {}
});

router.post("/matches/:id/go-live", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, Number(req.params.id)));
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  if (match.hostId !== user.id && user.role !== "admin") {
    res.status(403).json({ error: "Unauthorized" }); return;
  }
  await db.update(matchesTable).set({ status: "live", escrowStatus: "locked" } as any).where(eq(matchesTable.id, match.id));
  res.json({ success: true, message: "Match is now live" });
  try { getIO().emit("match:updated", { id: match.id }); } catch {}

  const participants = await db.select({ userId: matchParticipantsTable.userId })
    .from(matchParticipantsTable).where(eq(matchParticipantsTable.matchId, match.id));
  const notifMsg = `Match ${match.code} has gone LIVE! 🔴 Get ready to play.`;
  for (const p of participants) {
    notify(p.userId, "match_live", notifMsg, `/matches/${match.id}`).catch(() => {});
  }
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

  const { results, screenshotUrls } = req.body as {
    results: { participantId: number; rank: number; reward: number }[];
    screenshotUrls?: string[];
  };
  if (!Array.isArray(results) || results.length === 0) {
    res.status(400).json({ error: "Results are required" }); return;
  }
  if (!Array.isArray(screenshotUrls) || screenshotUrls.length === 0) {
    res.status(400).json({ error: "At least 1 in-game result screenshot is required" }); return;
  }
  if (results.some(r => typeof r.reward !== "number" || r.reward < 0)) {
    res.status(400).json({ error: "All reward values must be non-negative numbers" }); return;
  }

  const entryFeeNum = parseFloat(match.entryFee as string);
  const hostStakeNum = parseFloat(((match as any).hostStake as string) ?? "0");
  const escrowBalanceNum = parseFloat(((match as any).escrowBalance as string) ?? "0");
  const entryFeePool = match.filledSlots * entryFeeNum;
  const hostPercent = parseFloat(((match as any).hostCommissionPercent as string) ?? "10") / 100;
  const platformPercent = 0.05;
  const maxWinnersPool = Math.max(0, entryFeePool - entryFeePool * hostPercent - entryFeePool * platformPercent);
  const hostCut = parseFloat((entryFeePool * hostPercent).toFixed(2));
  const platformCut = parseFloat((entryFeePool * platformPercent).toFixed(2));
  const totalReward = results.reduce((sum, r) => sum + r.reward, 0);
  if (totalReward > maxWinnersPool + 0.01) {
    res.status(400).json({ error: `Total rewards (${totalReward} GC) exceed the winners pool (${maxWinnersPool.toFixed(2)} GC)` }); return;
  }
  if (totalReward + hostCut + platformCut + hostStakeNum > escrowBalanceNum + 0.01) {
    res.status(400).json({ error: "Escrow balance is not enough for this distribution" }); return;
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
            tournament_wins = tournament_wins + 1,
            daily_tournament_wins = CASE WHEN daily_task_date = ${today} THEN daily_tournament_wins + 1 ELSE 1 END,
            daily_task_date = ${today}
          WHERE id = (SELECT user_id FROM match_participants WHERE id = ${r.participantId})
          RETURNING id, daily_tournament_wins`
        );
        const winRow = winResult.rows[0] as any;
        await tx.insert(matchEscrowTransactionsTable).values({
          matchId: match.id,
          userId: winRow?.id ?? null,
          type: "prize_payout",
          amount: String(r.reward),
        });
        // Award 10 Silver Coins when daily 5-tournament-wins task first completes
        if (winRow && winRow.daily_tournament_wins === 5) {
          await tx.execute(sql`UPDATE users SET silver_coins = silver_coins + 10 WHERE id = ${winRow.id}`);
        }
      }
    }

    const completedParticipants = await tx.select({ userId: matchParticipantsTable.userId }).from(matchParticipantsTable).where(eq(matchParticipantsTable.matchId, match.id));
    for (const participant of completedParticipants) {
      await addTrustScoreEvent(tx, participant.userId, "match_completed", 50, "Completed match without dispute", match.id);
    }

    if (hostCut > 0) {
      await tx.execute(sql`UPDATE users SET balance = balance + ${hostCut} WHERE id = ${match.hostId}`);
      await tx.insert(hostEarningsTable).values({
        hostId: match.hostId,
        matchId: match.id,
        matchCode: match.code,
        amount: String(hostCut),
      });
      await tx.insert(matchEscrowTransactionsTable).values({
        matchId: match.id,
        userId: match.hostId,
        type: "host_commission",
        amount: String(hostCut),
      });
    }

    if (platformCut > 0) {
      await tx.insert(platformEarningsTable).values({
        hostId: match.hostId,
        matchId: match.id,
        matchCode: match.code,
        amount: String(platformCut),
      });
      await tx.insert(matchEscrowTransactionsTable).values({
        matchId: match.id,
        userId: null,
        type: "platform_fee",
        amount: String(platformCut),
      } as any);
    }

    if (hostStakeNum > 0) {
      await tx.execute(sql`UPDATE users SET balance = balance + ${hostStakeNum} WHERE id = ${match.hostId}`);
      await tx.insert(matchEscrowTransactionsTable).values({
        matchId: match.id,
        userId: match.hostId,
        type: "host_stake",
        amount: String(hostStakeNum),
      });
    }

    const screenshotExpiry = new Date();
    screenshotExpiry.setDate(screenshotExpiry.getDate() + 3);
    await tx.update(matchesTable).set({
      status: "completed",
      resultScreenshotUrls: JSON.stringify(screenshotUrls),
      screenshotUploadedAt: new Date(),
      escrowBalance: "0",
      escrowStatus: "distributed",
      prizeDistributedAt: new Date(),
    } as any).where(eq(matchesTable.id, match.id));
  });

  res.json({ success: true, message: "Result submitted and rewards distributed!" });
  const participants = await db.select({ userId: matchParticipantsTable.userId, reward: matchParticipantsTable.reward })
    .from(matchParticipantsTable).where(eq(matchParticipantsTable.matchId, match.id));
  for (const p of participants) {
    const reward = p.reward ? parseFloat(p.reward as string) : 0;
    const msg = reward > 0
      ? `Match ${match.code} results are in! You won ${reward} GC 🏆`
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
    const [userInfo] = await db.select({
      trustScore: usersTable.trustScore,
      trustTier: usersTable.trustTier,
      name: usersTable.name,
      avatar: usersTable.avatar,
    }).from(usersTable).where(eq(usersTable.id, p.userId));
    return {
      id: p.id,
      userId: p.userId,
      teamName: p.teamName,
      teamNumber: p.teamNumber,
      rank: p.rank ?? null,
      reward: p.reward ? parseFloat(p.reward as string) : null,
      trustScore: userInfo?.trustScore ?? 500,
      trustTier: userInfo?.trustTier ?? "bronze",
      userName: userInfo?.name ?? null,
      userAvatar: userInfo?.avatar ?? null,
      players: players.map(pl => ({
        ign: pl.ign,
        uid: canSeeFullUid ? pl.uid : (pl.uid ? pl.uid.slice(0, 3) + "****" : "****"),
        position: pl.position,
      })),
      kills: p.kills ?? null,
    };
  }));
  res.json(result);
});

router.put("/matches/:id/leaderboard", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const matchId = Number(req.params.id);
  const { entries } = req.body as { entries: { participantId: number; kills: number | null; rank: number | null }[] };

  if (!Array.isArray(entries) || entries.length === 0) {
    res.status(400).json({ error: "entries array is required" }); return;
  }

  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, matchId));
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  if (user.id !== match.hostId && user.role !== "admin") {
    res.status(403).json({ error: "Only the host can update the leaderboard" }); return;
  }

  for (const entry of entries) {
    await db.update(matchParticipantsTable).set({
      kills: entry.kills ?? null,
      rank: entry.rank ?? null,
    }).where(and(eq(matchParticipantsTable.id, entry.participantId), eq(matchParticipantsTable.matchId, matchId)));
  }

  try { getIO().emit("match:leaderboard", { matchId }); } catch {}
  res.json({ success: true });
});

router.delete("/matches/:id/participants/:participantId", requireAuth, async (req: Request, res: Response) => {
  const requestingUser = (req as any).user;
  const matchId = Number(req.params.id);
  const participantId = Number(req.params.participantId);

  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, matchId));
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  if (requestingUser.id !== match.hostId && requestingUser.role !== "admin") {
    res.status(403).json({ error: "Only the host can remove players" }); return;
  }
  if (match.status === "completed") {
    res.status(400).json({ error: "Cannot kick players from a completed match" }); return;
  }

  const [participant] = await db.select().from(matchParticipantsTable)
    .where(and(eq(matchParticipantsTable.id, participantId), eq(matchParticipantsTable.matchId, matchId)));
  if (!participant) { res.status(404).json({ error: "Participant not found" }); return; }

  await db.transaction(async (tx) => {
    const entryFee = parseFloat(String(match.entryFee ?? 0));
    if (entryFee > 0) {
      await tx.execute(sql`UPDATE users SET balance = balance + ${entryFee} WHERE id = ${participant.userId}`);
      await tx.insert(matchEscrowTransactionsTable).values({
        matchId: match.id,
        userId: participant.userId,
        type: "refund",
        amount: String(entryFee),
      });
    }
    await tx.delete(matchPlayersTable).where(eq(matchPlayersTable.participantId, participantId));
    await tx.delete(matchParticipantsTable).where(eq(matchParticipantsTable.id, participantId));
    await tx.execute(sql`UPDATE matches SET filled_slots = GREATEST(0, filled_slots - 1) WHERE id = ${matchId}`);
  });

  try { getIO().emit("match:updated", { id: matchId }); } catch {}
  res.json({ success: true, message: "Player kicked and entry fee refunded" });
});

router.get("/players/:userId/matches", requireAuth, async (req: Request, res: Response) => {
  const targetUserId = parseInt(req.params.userId);
  const currentUser = (req as any).user;
  const participations = await db.select().from(matchParticipantsTable)
    .where(eq(matchParticipantsTable.userId, targetUserId));
  const allMatches = await Promise.all(participations.map(async (p) => {
    const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, p.matchId));
    if (!match) return null;
    return serializeMatch(match, currentUser.id);
  }));
  res.json(allMatches.filter(Boolean));
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
  const [existing] = await db.select().from(hostRatingsTable).where(
    and(eq(hostRatingsTable.matchId, matchId), eq(hostRatingsTable.raterId, user.id))
  );
  if (existing) { res.status(400).json({ error: "You have already reviewed this match" }); return; }
  const { rating, overallRating, comment, prizeOnTime, roomCodeOnTime } = req.body;
  const parsedRating = parseInt(overallRating ?? rating);
  if (!parsedRating || parsedRating < 1 || parsedRating > 5) {
    res.status(400).json({ error: "Rating must be between 1 and 5" }); return;
  }
  await db.transaction(async (tx) => {
    await tx.insert(hostRatingsTable).values({
      matchId,
      raterId: user.id,
      hostId: match.hostId,
      prizeOnTime: prizeOnTime !== false,
      roomCodeOnTime: roomCodeOnTime !== false,
      overallRating: parsedRating,
    });
    await tx.insert(hostReviewsTable).values({
      matchId,
      reviewerId: user.id,
      hostId: match.hostId,
      rating: parsedRating,
      comment: comment?.trim() || null,
    });
    await recomputeHostRating(tx, match.hostId);
  });
  res.json({ success: true });
});

router.get("/matches/:id/bracket", requireAuth, async (req: Request, res: Response) => {
  const matchId = parseInt(req.params.id);
  const [bracket] = await db.select().from(tournamentBracketsTable).where(eq(tournamentBracketsTable.matchId, matchId));
  if (!bracket) { res.status(404).json({ error: "No bracket found" }); return; }
  res.json({ matchId: bracket.matchId, bracketData: JSON.parse(bracket.bracketData) });
});

router.post("/matches/:id/bracket", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const matchId = parseInt(req.params.id);
  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, matchId));
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  if (match.hostId !== user.id && user.role !== "admin") { res.status(403).json({ error: "Not authorized" }); return; }
  if (!match.isEsportsOnly) { res.status(400).json({ error: "Brackets are only for esports matches" }); return; }
  const [existing] = await db.select().from(tournamentBracketsTable).where(eq(tournamentBracketsTable.matchId, matchId));
  if (existing) { res.status(400).json({ error: "Bracket already exists" }); return; }

  const teams = await db.select().from(matchParticipantsTable)
    .where(eq(matchParticipantsTable.matchId, matchId))
    .orderBy(matchParticipantsTable.teamNumber);
  if (teams.length < 2) { res.status(400).json({ error: "Need at least 2 teams to create a bracket" }); return; }

  const teamNames = teams.map(t => t.teamName || `Team ${t.teamNumber}`);
  const n = teamNames.length;
  const rounds: { name: string; roundNumber: number; matches: { id: string; team1: string | null; team2: string | null; winner: string | null }[] }[] = [];

  const roundNames = ["Round of 16", "Quarter-Final", "Semi-Final", "Final"];
  let slots = 1;
  while (slots < n) slots *= 2;
  const totalRounds = Math.log2(slots);

  for (let r = 0; r < totalRounds; r++) {
    const matchCount = slots / Math.pow(2, r + 1);
    const name = roundNames[roundNames.length - (totalRounds - r)];
    const matches = Array.from({ length: matchCount }, (_, i) => ({
      id: `r${r + 1}m${i + 1}`,
      team1: r === 0 ? (teamNames[i * 2] ?? null) : null,
      team2: r === 0 ? (teamNames[i * 2 + 1] ?? null) : null,
      winner: null as string | null,
    }));
    if (r === 0) {
      matches.forEach(m => { if (m.team1 && !m.team2) { m.winner = m.team1; } });
    }
    rounds.push({ name: name || `Round ${r + 1}`, roundNumber: r + 1, matches });
  }

  const bracketData = { rounds };
  await db.insert(tournamentBracketsTable).values({ matchId, bracketData: JSON.stringify(bracketData) });
  res.json({ matchId, bracketData });
});

router.put("/matches/:id/bracket", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const matchId = parseInt(req.params.id);
  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, matchId));
  if (!match) { res.status(404).json({ error: "Match not found" }); return; }
  if (match.hostId !== user.id && user.role !== "admin") { res.status(403).json({ error: "Not authorized" }); return; }
  const { bracketData } = req.body;
  if (!bracketData) { res.status(400).json({ error: "bracketData required" }); return; }
  await db.update(tournamentBracketsTable)
    .set({ bracketData: JSON.stringify(bracketData), updatedAt: new Date() })
    .where(eq(tournamentBracketsTable.matchId, matchId));
  res.json({ matchId, bracketData });
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
