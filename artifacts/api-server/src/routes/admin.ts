import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  usersTable, matchesTable, matchParticipantsTable, matchPlayersTable,
  addBalanceRequestsTable, withdrawalRequestsTable, complaintsTable,
  platformEarningsTable, hostEarningsTable,
  auctionsTable, auctionTeamsTable, auctionPlayersTable, auctionBidsTable, auctionResultsTable
} from "@workspace/db/schema";
import { eq, and, ilike, or, sql, gte, desc } from "drizzle-orm";
import { requireAuth } from "./auth";
import bcrypt from "bcryptjs";
import { notify } from "../lib/notify";

const router: IRouter = Router();

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

async function requireAdmin(req: Request, res: Response, next: Function) {
  await requireAuth(req, res, async () => {
    const user = (req as any).user;
    if (user.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  });
}

router.get("/admin/dashboard", requireAdmin, async (req: Request, res: Response) => {
  const allPlayers = await db.select().from(usersTable).where(eq(usersTable.role, "player"));
  const activePlayers = allPlayers.filter(p => p.status === "active");
  const pendingKyc = allPlayers.filter(p => p.status === "pending");
  const hosts = await db.select().from(usersTable).where(eq(usersTable.role, "host"));
  const admins = await db.select().from(usersTable).where(eq(usersTable.role, "admin"));
  const allMatches = await db.select().from(matchesTable);
  const liveMatches = allMatches.filter(m => m.status === "live");
  const pendingWithdrawals = await db.select().from(withdrawalRequestsTable).where(eq(withdrawalRequestsTable.status, "pending"));
  const complaints = await db.select().from(complaintsTable);

  const completedMatches = allMatches.filter(m => m.status === "completed");
  const totalRevenue = completedMatches.reduce((sum, m) => {
    const totalEntryFees = m.filledSlots * parseFloat(m.entryFee as string);
    return sum + totalEntryFees;
  }, 0);
  const platformFees = completedMatches.reduce((sum, m) => {
    const totalEntryFees = m.filledSlots * parseFloat(m.entryFee as string);
    const isLargePool = m.filledSlots >= 8;
    const platformPercent = 0.05;
    const hostPercent = isLargePool ? 0.10 : 0.05;
    return sum + totalEntryFees * (platformPercent + hostPercent);
  }, 0);

  res.json({
    totalPlayers: allPlayers.length,
    activePlayers: activePlayers.length,
    pendingKyc: pendingKyc.length,
    hosts: hosts.length,
    totalMatches: allMatches.length,
    liveNow: liveMatches.length,
    pendingWithdrawals: pendingWithdrawals.length,
    totalRevenue,
    platformFees,
    complaintsCount: complaints.length,
    adminList: admins.map(a => ({ id: a.id, email: a.email, name: a.name, role: a.role })),
    hostList: hosts.map(h => ({ id: h.id, email: h.email, name: h.name, role: h.role, game: h.game, recommended: h.recommended })),
  });
});

router.get("/admin/players", requireAdmin, async (req: Request, res: Response) => {
  const { search, status } = req.query;
  let players = await db.select().from(usersTable).where(eq(usersTable.role, "player"));
  if (search) {
    players = players.filter(p =>
      p.name?.toLowerCase().includes((search as string).toLowerCase()) ||
      p.email.toLowerCase().includes((search as string).toLowerCase()) ||
      p.gameUid?.includes(search as string)
    );
  }
  if (status && status !== "all") {
    players = players.filter(p => p.status === status);
  }
  const result = await Promise.all(players.map(async p => {
    const participations = await db.select().from(matchParticipantsTable).where(eq(matchParticipantsTable.userId, p.id));
    return {
      id: p.id, name: p.name, email: p.email, uid: p.gameUid, handle: p.handle,
      balance: parseFloat(p.balance as string), status: p.status, matchesPlayed: participations.length,
    };
  }));
  res.json(result);
});

router.post("/admin/players/:id/verify", requireAdmin, async (req: Request, res: Response) => {
  await db.update(usersTable).set({ status: "active" }).where(eq(usersTable.id, Number(req.params.id)));
  res.json({ success: true });
});

router.post("/admin/players/:id/ban", requireAdmin, async (req: Request, res: Response) => {
  await db.update(usersTable).set({ status: "banned" }).where(eq(usersTable.id, Number(req.params.id)));
  res.json({ success: true });
});

router.delete("/admin/players/:id", requireAdmin, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const [player] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }
  if (player.role !== "player") { res.status(400).json({ error: "Only player accounts can be deleted" }); return; }
  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.json({ success: true });
});

router.post("/admin/players/:id/add-balance", requireAdmin, async (req: Request, res: Response) => {
  const { amount } = req.body;
  const parsedAmount = parseFloat(String(amount));
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    res.status(400).json({ error: "Invalid amount" }); return;
  }
  await db.execute(sql`UPDATE users SET balance = balance + ${parsedAmount} WHERE id = ${Number(req.params.id)}`);
  res.json({ success: true });
});

router.post("/admin/players/:id/set-balance", requireAdmin, async (req: Request, res: Response) => {
  const { amount } = req.body;
  const parsedAmount = parseFloat(String(amount));
  if (isNaN(parsedAmount) || parsedAmount < 0) {
    res.status(400).json({ error: "Invalid amount" }); return;
  }
  await db.execute(sql`UPDATE users SET balance = ${parsedAmount} WHERE id = ${Number(req.params.id)}`);
  res.json({ success: true });
});

router.get("/admin/finance/add-requests", requireAdmin, async (req: Request, res: Response) => {
  const { status } = req.query;
  let requests = await db.select().from(addBalanceRequestsTable);
  if (status && status !== "all") requests = requests.filter(r => r.status === status);
  const result = await Promise.all(requests.map(async r => {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, r.userId));
    return {
      id: r.id, userId: r.userId, userName: user?.name || user?.email, userEmail: user?.email,
      amount: parseFloat(r.amount as string), status: r.status, utrNumber: r.utrNumber,
      receiptUrl: r.receiptUrl || null,
      createdAt: r.createdAt?.toISOString(),
    };
  }));
  res.json(result);
});

router.post("/admin/finance/add-requests/:id/approve", requireAdmin, async (req: Request, res: Response) => {
  const requestId = Number(req.params.id);
  await db.transaction(async (tx) => {
    const [request] = await tx.select().from(addBalanceRequestsTable).where(eq(addBalanceRequestsTable.id, requestId));
    if (!request) { res.status(404).json({ error: "Request not found" }); return; }
    if (request.status !== "pending") { res.status(400).json({ error: "Request has already been processed" }); return; }
    const numericAmount = parseFloat(request.amount as string);
    if (isNaN(numericAmount) || numericAmount <= 0) { res.status(400).json({ error: "Invalid request amount" }); return; }
    await tx.update(addBalanceRequestsTable).set({ status: "approved" }).where(eq(addBalanceRequestsTable.id, request.id));
    await tx.execute(sql`UPDATE users SET balance = balance + ${numericAmount} WHERE id = ${request.userId}`);
    res.json({ success: true });
    notify(request.userId, "balance_approved", `Your deposit of ₹${numericAmount} has been approved! 💰`, "/wallet").catch(() => {});
  });
});

router.post("/admin/finance/add-requests/:id/reject", requireAdmin, async (req: Request, res: Response) => {
  const [request] = await db.select().from(addBalanceRequestsTable).where(eq(addBalanceRequestsTable.id, Number(req.params.id)));
  await db.update(addBalanceRequestsTable).set({ status: "rejected" }).where(eq(addBalanceRequestsTable.id, Number(req.params.id)));
  res.json({ success: true });
  if (request) notify(request.userId, "balance_rejected", `Your deposit request of ₹${parseFloat(request.amount as string)} was rejected. Contact support for help.`, "/wallet").catch(() => {});
});

router.get("/admin/finance/withdrawals", requireAdmin, async (req: Request, res: Response) => {
  const { status } = req.query;
  let requests = await db.select().from(withdrawalRequestsTable);
  if (status && status !== "all") requests = requests.filter(r => r.status === status);
  const result = await Promise.all(requests.map(async r => {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, r.userId));
    return {
      id: r.id, userId: r.userId, userName: user?.name || user?.email, userEmail: user?.email,
      amount: parseFloat(r.amount as string), status: r.status, upiId: r.upiId,
      createdAt: r.createdAt?.toISOString(),
    };
  }));
  res.json(result);
});

router.post("/admin/finance/withdrawals/:id/approve", requireAdmin, async (req: Request, res: Response) => {
  const requestId = Number(req.params.id);
  const [request] = await db.select().from(withdrawalRequestsTable).where(eq(withdrawalRequestsTable.id, requestId));
  if (!request) { res.status(404).json({ error: "Not found" }); return; }
  if (request.status !== "pending") { res.status(400).json({ error: "Request has already been processed" }); return; }
  await db.update(withdrawalRequestsTable).set({ status: "approved" }).where(eq(withdrawalRequestsTable.id, requestId));
  res.json({ success: true });
  notify(request.userId, "withdrawal_approved", `Your withdrawal of ₹${parseFloat(request.amount as string)} has been approved and sent to your UPI! 🎉`, "/wallet").catch(() => {});
});

router.post("/admin/finance/withdrawals/:id/reject", requireAdmin, async (req: Request, res: Response) => {
  await db.transaction(async (tx) => {
    const [request] = await tx.select().from(withdrawalRequestsTable).where(eq(withdrawalRequestsTable.id, Number(req.params.id)));
    if (!request) { res.status(404).json({ error: "Not found" }); return; }
    if (request.status !== "pending") { res.status(400).json({ error: "Request has already been processed" }); return; }
    const numericAmount = parseFloat(request.amount as string);
    if (isNaN(numericAmount) || numericAmount <= 0) { res.status(400).json({ error: "Invalid request amount" }); return; }
    await tx.update(withdrawalRequestsTable).set({ status: "rejected" }).where(eq(withdrawalRequestsTable.id, request.id));
    await tx.execute(sql`UPDATE users SET balance = balance + ${numericAmount} WHERE id = ${request.userId}`);
    res.json({ success: true });
    notify(request.userId, "withdrawal_rejected", `Your withdrawal of ₹${numericAmount} was rejected. The amount has been returned to your wallet.`, "/wallet").catch(() => {});
  });
});

router.post("/admin/create-host", requireAdmin, async (req: Request, res: Response) => {
  const { email, password, name, game } = req.body;
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing) { res.status(400).json({ error: "Email already exists" }); return; }

  const baseHandle = (name || "host").toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  let handle = baseHandle;
  let suffix = 1;
  while (true) {
    const [taken] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.handle, handle));
    if (!taken) break;
    handle = `${baseHandle}_${suffix++}`;
  }

  await db.insert(usersTable).values({
    email, password: await hashPassword(password), name, handle, game: game || null, role: "host", status: "active", profileSetup: true, balance: "0",
  });
  res.json({ success: true });
});

router.delete("/admin/hosts/:id", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const [host] = await db.select().from(usersTable).where(and(eq(usersTable.id, id), eq(usersTable.role, "host")));
  if (!host) { res.status(404).json({ error: "Host not found" }); return; }

  await db.transaction(async (tx) => {
    // Delete match-related data for this host's matches
    const hostMatches = await tx.select({ id: matchesTable.id }).from(matchesTable).where(eq(matchesTable.hostId, id));
    const matchIds = hostMatches.map(m => m.id);
    if (matchIds.length > 0) {
      const participants = await tx.select({ id: matchParticipantsTable.id }).from(matchParticipantsTable).where(sql`match_id = ANY(${matchIds})`);
      const participantIds = participants.map(p => p.id);
      if (participantIds.length > 0) {
        await tx.delete(matchPlayersTable).where(sql`participant_id = ANY(${participantIds})`);
      }
      await tx.delete(matchParticipantsTable).where(sql`match_id = ANY(${matchIds})`);
      await tx.delete(hostEarningsTable).where(sql`match_id = ANY(${matchIds})`);
      await tx.delete(platformEarningsTable).where(sql`match_id = ANY(${matchIds})`);
      await tx.delete(matchesTable).where(sql`id = ANY(${matchIds})`);
    }

    // Delete auction-related data for this host's auctions
    const hostAuctions = await tx.select({ id: auctionsTable.id }).from(auctionsTable).where(eq(auctionsTable.hostId, id));
    const auctionIds = hostAuctions.map(a => a.id);
    if (auctionIds.length > 0) {
      const teams = await tx.select({ id: auctionTeamsTable.id }).from(auctionTeamsTable).where(sql`auction_id = ANY(${auctionIds})`);
      const teamIds = teams.map(t => t.id);
      if (teamIds.length > 0) {
        await tx.delete(auctionPlayersTable).where(sql`team_id = ANY(${teamIds})`);
      }
      await tx.delete(auctionResultsTable).where(sql`auction_id = ANY(${auctionIds})`);
      await tx.delete(auctionBidsTable).where(sql`auction_id = ANY(${auctionIds})`);
      await tx.delete(auctionTeamsTable).where(sql`auction_id = ANY(${auctionIds})`);
      await tx.delete(auctionsTable).where(sql`id = ANY(${auctionIds})`);
    }

    // Delete the host
    await tx.delete(usersTable).where(eq(usersTable.id, id));
  });

  res.json({ success: true });
});

router.patch("/admin/hosts/:id/recommend", requireAdmin, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const [host] = await db.select().from(usersTable).where(and(eq(usersTable.id, id), eq(usersTable.role, "host")));
  if (!host) { res.status(404).json({ error: "Host not found" }); return; }
  const [updated] = await db.update(usersTable).set({ recommended: !host.recommended }).where(eq(usersTable.id, id)).returning();
  res.json({ recommended: updated.recommended });
});

router.post("/admin/create-admin", requireAdmin, async (req: Request, res: Response) => {
  const { email, password, name } = req.body;
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing) { res.status(400).json({ error: "Email already exists" }); return; }
  await db.insert(usersTable).values({
    email, password: await hashPassword(password), name, role: "admin", status: "active", profileSetup: true, balance: "0",
  });
  res.json({ success: true });
});

router.get("/admin/complaints", requireAdmin, async (req: Request, res: Response) => {
  const complaints = await db.select().from(complaintsTable).orderBy(complaintsTable.createdAt);
  const result = await Promise.all(complaints.map(async c => {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, c.userId));
    const matchCount = await db.$count(matchParticipantsTable, eq(matchParticipantsTable.userId, c.userId));
    return {
      id: c.id, userId: c.userId,
      userName: user?.name || user?.email,
      userHandle: user?.handle || null,
      userAvatar: user?.avatar || null,
      userWallet: user?.balance ? parseFloat(user.balance as string) : null,
      userEmail: user?.email || null,
      userRole: user?.role || "player",
      userMatchCount: matchCount,
      subject: c.subject, description: c.description,
      hostHandle: c.hostHandle || null,
      imageUrl: c.imageUrl || null,
      createdAt: c.createdAt?.toISOString(),
    };
  }));
  res.json(result);
});

router.get("/admin/platform-earnings", requireAdmin, async (req: Request, res: Response) => {
  const earnings = await db.select().from(platformEarningsTable).orderBy(platformEarningsTable.createdAt);
  const result = await Promise.all(earnings.map(async (e) => {
    const [host] = await db.select().from(usersTable).where(eq(usersTable.id, e.hostId));
    return {
      id: e.id,
      matchCode: e.matchCode,
      amount: e.amount,
      createdAt: e.createdAt?.toISOString(),
      hostName: host?.name || host?.email || "Unknown Host",
      hostHandle: host?.handle || null,
    };
  }));
  const total = earnings.reduce((sum, e) => sum + parseFloat(e.amount as string), 0);
  res.json({ earnings: result, total: total.toFixed(2) });
});

router.delete("/admin/platform-earnings", requireAdmin, async (req: Request, res: Response) => {
  await db.delete(platformEarningsTable);
  res.json({ success: true });
});

router.get("/admin/earnings", requireAdmin, async (req: Request, res: Response) => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30);
  const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(now.getDate() - 7);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const allEarnings = await db.select().from(platformEarningsTable).orderBy(desc(platformEarningsTable.createdAt));

  const totalAllTime = allEarnings.reduce((s, e) => s + parseFloat(e.amount as string), 0);
  const last30 = allEarnings.filter(e => new Date(e.createdAt!) >= thirtyDaysAgo);
  const last7 = allEarnings.filter(e => new Date(e.createdAt!) >= sevenDaysAgo);
  const thisMonth = allEarnings.filter(e => new Date(e.createdAt!) >= startOfMonth);

  const totalLast30 = last30.reduce((s, e) => s + parseFloat(e.amount as string), 0);
  const totalLast7 = last7.reduce((s, e) => s + parseFloat(e.amount as string), 0);
  const totalThisMonth = thisMonth.reduce((s, e) => s + parseFloat(e.amount as string), 0);

  const dailyMap = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now); d.setDate(now.getDate() - i);
    dailyMap.set(d.toISOString().split("T")[0], 0);
  }
  for (const e of last30) {
    const day = new Date(e.createdAt!).toISOString().split("T")[0];
    if (dailyMap.has(day)) dailyMap.set(day, (dailyMap.get(day) ?? 0) + parseFloat(e.amount as string));
  }
  const dailyBreakdown = Array.from(dailyMap.entries()).map(([date, amount]) => ({ date, amount }));

  const gameMap = new Map<string, number>();
  for (const e of allEarnings) {
    const [match] = await db.select({ game: matchesTable.game }).from(matchesTable).where(eq(matchesTable.id, e.matchId));
    const game = match?.game || "Unknown";
    gameMap.set(game, (gameMap.get(game) ?? 0) + parseFloat(e.amount as string));
  }
  const byGame = Array.from(gameMap.entries())
    .map(([game, amount]) => ({ game, amount }))
    .sort((a, b) => b.amount - a.amount);

  const recentEarnings = allEarnings.slice(0, 30).map(e => ({
    id: e.id,
    matchId: e.matchId,
    matchCode: e.matchCode,
    amount: parseFloat(e.amount as string),
    createdAt: e.createdAt?.toISOString(),
  }));

  res.json({ totalAllTime, totalLast30, totalLast7, totalThisMonth, dailyBreakdown, byGame, recentEarnings });
});

export default router;
