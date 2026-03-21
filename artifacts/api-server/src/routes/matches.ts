import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { matchesTable, matchParticipantsTable, matchPlayersTable, usersTable } from "@workspace/db/schema";
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

  const result: any = {
    id: match.id,
    code: match.code,
    game: match.game,
    mode: match.mode,
    teamSize: match.teamSize,
    entryFee: parseFloat(match.entryFee as string),
    prizePool: parseFloat(match.prizePool as string),
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
  const { game, mode, teamSize, entryFee, slots, startTime } = req.body;
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
    prizePool: "0",
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

  if (match.filledSlots >= match.slots) { res.status(400).json({ error: "Match is full" }); return; }

  const { teamName, players } = req.body;
  const totalFee = parseFloat(match.entryFee as string) * (match.teamSize > 1 ? match.teamSize : 1);
  const userBalance = parseFloat(user.balance as string);
  if (userBalance < totalFee) { res.status(400).json({ error: "Insufficient balance" }); return; }

  await db.execute(sql`UPDATE users SET balance = balance - ${totalFee} WHERE id = ${user.id}`);

  const teamNumber = match.filledSlots / match.teamSize + 1;
  const [participant] = await db.insert(matchParticipantsTable).values({
    matchId: match.id,
    userId: user.id,
    teamName: teamName || null,
    teamNumber: Math.ceil(teamNumber),
  }).returning();

  const playerList = players || [{ ign: user.name || user.email, uid: user.gameUid || "0" }];
  for (let i = 0; i < playerList.length; i++) {
    await db.insert(matchPlayersTable).values({
      participantId: participant.id,
      matchId: match.id,
      ign: playerList[i].ign,
      uid: playerList[i].uid,
      position: i + 1,
    });
  }

  const newFilledSlots = match.filledSlots + match.teamSize;
  const newPrizePool = newFilledSlots * parseFloat(match.entryFee as string);
  await db.update(matchesTable).set({
    filledSlots: newFilledSlots,
    prizePool: String(newPrizePool),
  }).where(eq(matchesTable.id, match.id));

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
