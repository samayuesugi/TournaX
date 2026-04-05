import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  auctionsTable, auctionTeamsTable, auctionPlayersTable,
  auctionBidsTable, auctionResultsTable,
} from "@workspace/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { requireAuth } from "./auth";

const router: IRouter = Router();

router.get("/auctions", requireAuth, async (req: Request, res: Response) => {
  const auctions = await db.select().from(auctionsTable).orderBy(auctionsTable.createdAt);
  const result = await Promise.all(auctions.map(async (a) => {
    const teams = await db.select().from(auctionTeamsTable).where(eq(auctionTeamsTable.auctionId, a.id));
    const bids = await db.select().from(auctionBidsTable).where(eq(auctionBidsTable.auctionId, a.id));
    const totalPool = bids.reduce((s, b) => s + parseFloat(b.amount as string), 0);
    return { ...a, teamsCount: teams.length, totalPool };
  }));
  res.json(result);
});

router.get("/auctions/my-history", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const myBids = await db.select({ auctionId: auctionBidsTable.auctionId })
    .from(auctionBidsTable)
    .where(eq(auctionBidsTable.userId, user.id));
  const auctionIds = [...new Set(myBids.map(b => b.auctionId))];
  if (auctionIds.length === 0) { res.json([]); return; }
  const auctions = await db.select().from(auctionsTable)
    .where(and(inArray(auctionsTable.id, auctionIds), eq(auctionsTable.status, "completed")))
    .orderBy(auctionsTable.createdAt);
  const result = await Promise.all(auctions.map(async (a) => {
    const teams = await db.select().from(auctionTeamsTable).where(eq(auctionTeamsTable.auctionId, a.id));
    const bids = await db.select().from(auctionBidsTable).where(eq(auctionBidsTable.auctionId, a.id));
    const myBidsForAuction = bids.filter(b => b.userId === user.id);
    const totalPool = bids.reduce((s, b) => s + parseFloat(b.amount as string), 0);
    const myTotalBid = myBidsForAuction.reduce((s, b) => s + parseFloat(b.amount as string), 0);
    const [resultRow] = await db.select().from(auctionResultsTable).where(eq(auctionResultsTable.auctionId, a.id));
    return { ...a, teamsCount: teams.length, totalPool, myTotalBid, result: resultRow || null };
  }));
  res.json(result);
});

router.get("/auctions/:id", requireAuth, async (req: Request, res: Response) => {
  const auctionId = Number(req.params.id);
  const user = (req as any).user;

  const [auction] = await db.select().from(auctionsTable).where(eq(auctionsTable.id, auctionId));
  if (!auction) { res.status(404).json({ error: "Auction not found" }); return; }

  const teams = await db.select().from(auctionTeamsTable)
    .where(eq(auctionTeamsTable.auctionId, auctionId))
    .orderBy(auctionTeamsTable.displayOrder);

  const players = await db.select().from(auctionPlayersTable)
    .where(eq(auctionPlayersTable.auctionId, auctionId))
    .orderBy(auctionPlayersTable.position);

  const bids = await db.select().from(auctionBidsTable).where(eq(auctionBidsTable.auctionId, auctionId));

  const teamBidTotals: Record<number, number> = {};
  const userBids: Record<number, number> = {};
  let totalPool = 0;

  for (const bid of bids) {
    const amt = parseFloat(bid.amount as string);
    teamBidTotals[bid.teamId] = (teamBidTotals[bid.teamId] || 0) + amt;
    totalPool += amt;
    if (bid.userId === user.id) {
      userBids[bid.teamId] = (userBids[bid.teamId] || 0) + amt;
    }
  }

  const teamsWithDetails = teams.map(team => ({
    ...team,
    players: players.filter(p => p.teamId === team.id),
    totalBidAmount: teamBidTotals[team.id] || 0,
    myBidAmount: userBids[team.id] || 0,
  }));

  let result = null;
  if (auction.status === "completed") {
    const [r] = await db.select().from(auctionResultsTable).where(eq(auctionResultsTable.auctionId, auctionId));
    result = r || null;
  }

  res.json({ ...auction, teams: teamsWithDetails, totalPool, result });
});

router.post("/auctions", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!["admin", "host"].includes(user.role)) { res.status(403).json({ error: "Admin only" }); return; }
  const { title, tournamentName, startTime, endTime, bannerUrl } = req.body;
  if (!title || !tournamentName) {
    res.status(400).json({ error: "title and tournamentName are required" }); return;
  }
  const [auction] = await db.insert(auctionsTable).values({
    title, tournamentName, hostId: user.id,
    bannerUrl: bannerUrl || null,
    startTime: startTime ? new Date(startTime) : null,
    endTime: endTime ? new Date(endTime) : null,
  }).returning();
  res.json(auction);
});

router.put("/auctions/:id", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!["admin", "host"].includes(user.role)) { res.status(403).json({ error: "Admin only" }); return; }
  const auctionId = Number(req.params.id);
  const [auction] = await db.select().from(auctionsTable).where(eq(auctionsTable.id, auctionId));
  if (!auction) { res.status(404).json({ error: "Auction not found" }); return; }
  if (user.role === "host" && auction.hostId !== user.id) { res.status(403).json({ error: "You can only edit your own auctions" }); return; }
  if (auction.status === "completed" || auction.status === "cancelled") {
    res.status(400).json({ error: "Cannot edit a finished auction" }); return;
  }
  const { title, tournamentName, startTime, endTime } = req.body;
  const [updated] = await db.update(auctionsTable).set({
    ...(title && { title }),
    ...(tournamentName && { tournamentName }),
    ...(startTime !== undefined && { startTime: startTime ? new Date(startTime) : null }),
    ...(endTime !== undefined && { endTime: endTime ? new Date(endTime) : null }),
  }).where(eq(auctionsTable.id, auctionId)).returning();
  res.json(updated);
});

router.post("/auctions/:id/go-live", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!["admin", "host"].includes(user.role)) { res.status(403).json({ error: "Admin only" }); return; }
  const auctionId = Number(req.params.id);
  const [auction] = await db.select().from(auctionsTable).where(eq(auctionsTable.id, auctionId));
  if (!auction) { res.status(404).json({ error: "Auction not found" }); return; }
  if (user.role === "host" && auction.hostId !== user.id) { res.status(403).json({ error: "You can only manage your own auctions" }); return; }
  if (auction.status !== "upcoming") { res.status(400).json({ error: "Auction is not in upcoming status" }); return; }
  await db.update(auctionsTable).set({ status: "live" }).where(eq(auctionsTable.id, auctionId));
  res.json({ success: true });
});

router.post("/auctions/:id/stop", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!["admin", "host"].includes(user.role)) { res.status(403).json({ error: "Admin only" }); return; }
  const auctionId = Number(req.params.id);
  const [auction] = await db.select().from(auctionsTable).where(eq(auctionsTable.id, auctionId));
  if (!auction) { res.status(404).json({ error: "Auction not found" }); return; }
  if (user.role === "host" && auction.hostId !== user.id) { res.status(403).json({ error: "You can only manage your own auctions" }); return; }
  if (auction.status !== "live") { res.status(400).json({ error: "Auction is not live" }); return; }
  await db.update(auctionsTable).set({ status: "upcoming" }).where(eq(auctionsTable.id, auctionId));
  res.json({ success: true });
});

router.post("/auctions/:id/cancel", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!["admin", "host"].includes(user.role)) { res.status(403).json({ error: "Admin only" }); return; }
  const auctionId = Number(req.params.id);
  const [auction] = await db.select().from(auctionsTable).where(eq(auctionsTable.id, auctionId));
  if (!auction) { res.status(404).json({ error: "Auction not found" }); return; }
  if (user.role === "host" && auction.hostId !== user.id) { res.status(403).json({ error: "You can only cancel your own auctions" }); return; }
  if (auction.status === "completed" || auction.status === "cancelled") {
    res.status(400).json({ error: "Auction is already finished" }); return;
  }
  await db.transaction(async (tx) => {
    const bids = await tx.select().from(auctionBidsTable).where(eq(auctionBidsTable.auctionId, auctionId));
    for (const bid of bids) {
      await tx.execute(sql`UPDATE users SET balance = balance + ${parseFloat(bid.amount as string)} WHERE id = ${bid.userId}`);
    }
    await tx.update(auctionsTable).set({ status: "cancelled" }).where(eq(auctionsTable.id, auctionId));
  });
  res.json({ success: true, message: "Auction cancelled and all bids refunded" });
});

router.post("/auctions/:id/submit-result", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!["admin", "host"].includes(user.role)) { res.status(403).json({ error: "Admin only" }); return; }
  const auctionId = Number(req.params.id);
  const [auction] = await db.select().from(auctionsTable).where(eq(auctionsTable.id, auctionId));
  if (!auction) { res.status(404).json({ error: "Auction not found" }); return; }
  if (user.role === "host" && auction.hostId !== user.id) { res.status(403).json({ error: "You can only submit results for your own auctions" }); return; }
  if (auction.status === "completed") { res.status(400).json({ error: "Result already submitted" }); return; }
  if (auction.status === "cancelled") { res.status(400).json({ error: "Auction is cancelled" }); return; }

  const { firstTeamId, secondTeamId, thirdTeamId } = req.body;
  if (!firstTeamId || !secondTeamId || !thirdTeamId) {
    res.status(400).json({ error: "firstTeamId, secondTeamId, thirdTeamId required" }); return;
  }
  if (firstTeamId === secondTeamId || firstTeamId === thirdTeamId || secondTeamId === thirdTeamId) {
    res.status(400).json({ error: "Each placement must be a different team" }); return;
  }

  const bids = await db.select().from(auctionBidsTable).where(eq(auctionBidsTable.auctionId, auctionId));
  const totalPool = bids.reduce((s, b) => s + parseFloat(b.amount as string), 0);
  const platformFee = parseFloat((totalPool * 0.12).toFixed(2));
  const remainingPool = parseFloat((totalPool - platformFee).toFixed(2));

  const teamTotals: Record<number, number> = {};
  const teamBidders: Record<number, { userId: number; amount: number }[]> = {};
  for (const bid of bids) {
    const amt = parseFloat(bid.amount as string);
    teamTotals[bid.teamId] = (teamTotals[bid.teamId] || 0) + amt;
    if (!teamBidders[bid.teamId]) teamBidders[bid.teamId] = [];
    const existing = teamBidders[bid.teamId].find(b => b.userId === bid.userId);
    if (existing) existing.amount += amt;
    else teamBidders[bid.teamId].push({ userId: bid.userId, amount: amt });
  }

  const teamRewards: Record<number, number> = {
    [firstTeamId]: parseFloat((remainingPool * 0.50).toFixed(2)),
    [secondTeamId]: parseFloat((remainingPool * 0.30).toFixed(2)),
    [thirdTeamId]: parseFloat((remainingPool * 0.20).toFixed(2)),
  };

  await db.transaction(async (tx) => {
    for (const [teamIdStr, teamReward] of Object.entries(teamRewards)) {
      const teamId = Number(teamIdStr);
      const teamTotal = teamTotals[teamId] || 0;
      const bidders = teamBidders[teamId] || [];
      if (teamTotal === 0 || bidders.length === 0) continue;
      let distributed = 0;
      for (let i = 0; i < bidders.length; i++) {
        const bidder = bidders[i];
        const isLast = i === bidders.length - 1;
        const userReward = isLast
          ? parseFloat((teamReward - distributed).toFixed(2))
          : parseFloat(((bidder.amount / teamTotal) * teamReward).toFixed(2));
        distributed += userReward;
        if (userReward > 0) {
          await tx.execute(sql`UPDATE users SET balance = balance + ${userReward} WHERE id = ${bidder.userId}`);
        }
      }
    }
    await tx.insert(auctionResultsTable).values({
      auctionId,
      firstTeamId: Number(firstTeamId),
      secondTeamId: Number(secondTeamId),
      thirdTeamId: Number(thirdTeamId),
      totalPool: String(totalPool),
      platformFee: String(platformFee),
    });
    await tx.update(auctionsTable).set({ status: "completed" }).where(eq(auctionsTable.id, auctionId));
  });

  res.json({ success: true, message: "Result submitted and rewards distributed!" });
});

router.post("/auctions/:auctionId/teams", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!["admin", "host"].includes(user.role)) { res.status(403).json({ error: "Admin only" }); return; }
  const auctionId = Number(req.params.auctionId);
  const [auction] = await db.select().from(auctionsTable).where(eq(auctionsTable.id, auctionId));
  if (!auction) { res.status(404).json({ error: "Auction not found" }); return; }
  if (user.role === "host" && auction.hostId !== user.id) { res.status(403).json({ error: "You can only manage your own auctions" }); return; }
  const { name, logo, displayOrder } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const [team] = await db.insert(auctionTeamsTable).values({
    auctionId, name, logo: logo || null, displayOrder: displayOrder ?? 0,
  }).returning();
  res.json(team);
});

router.put("/auctions/:auctionId/teams/:teamId", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!["admin", "host"].includes(user.role)) { res.status(403).json({ error: "Admin only" }); return; }
  const teamId = Number(req.params.teamId);
  const { name, logo, displayOrder } = req.body;
  const [team] = await db.update(auctionTeamsTable).set({
    ...(name && { name }),
    ...(logo !== undefined && { logo }),
    ...(displayOrder !== undefined && { displayOrder }),
  }).where(eq(auctionTeamsTable.id, teamId)).returning();
  if (!team) { res.status(404).json({ error: "Team not found" }); return; }
  res.json(team);
});

router.delete("/auctions/:auctionId/teams/:teamId", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!["admin", "host"].includes(user.role)) { res.status(403).json({ error: "Admin only" }); return; }
  const teamId = Number(req.params.teamId);
  await db.delete(auctionPlayersTable).where(eq(auctionPlayersTable.teamId, teamId));
  await db.delete(auctionTeamsTable).where(eq(auctionTeamsTable.id, teamId));
  res.json({ success: true });
});

router.post("/auctions/:auctionId/teams/:teamId/players", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!["admin", "host"].includes(user.role)) { res.status(403).json({ error: "Admin only" }); return; }
  const auctionId = Number(req.params.auctionId);
  const teamId = Number(req.params.teamId);
  const { name, avatar, position } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const [player] = await db.insert(auctionPlayersTable).values({
    auctionId, teamId, name, avatar: avatar || null, position: position ?? 1,
  }).returning();
  res.json(player);
});

router.put("/auctions/:auctionId/teams/:teamId/players/:playerId", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!["admin", "host"].includes(user.role)) { res.status(403).json({ error: "Admin only" }); return; }
  const playerId = Number(req.params.playerId);
  const { name, avatar, position } = req.body;
  const [player] = await db.update(auctionPlayersTable).set({
    ...(name && { name }),
    ...(avatar !== undefined && { avatar }),
    ...(position !== undefined && { position }),
  }).where(eq(auctionPlayersTable.id, playerId)).returning();
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }
  res.json(player);
});

router.delete("/auctions/:auctionId/teams/:teamId/players/:playerId", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (!["admin", "host"].includes(user.role)) { res.status(403).json({ error: "Admin only" }); return; }
  const playerId = Number(req.params.playerId);
  await db.delete(auctionPlayersTable).where(eq(auctionPlayersTable.id, playerId));
  res.json({ success: true });
});

router.post("/auctions/:auctionId/bid", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (user.role !== "player") { res.status(403).json({ error: "Only players can bid" }); return; }
  const auctionId = Number(req.params.auctionId);
  const [auction] = await db.select().from(auctionsTable).where(eq(auctionsTable.id, auctionId));
  if (!auction) { res.status(404).json({ error: "Auction not found" }); return; }
  if (auction.status !== "live") { res.status(400).json({ error: "Auction is not live. Bidding is closed." }); return; }

  const { teamId, amount } = req.body;
  const parsedAmount = parseFloat(amount);
  if (!teamId || isNaN(parsedAmount) || parsedAmount < 1) {
    res.status(400).json({ error: "teamId and a minimum bid of 1 GC are required" }); return;
  }

  const [team] = await db.select().from(auctionTeamsTable).where(
    and(eq(auctionTeamsTable.id, Number(teamId)), eq(auctionTeamsTable.auctionId, auctionId))
  );
  if (!team) { res.status(404).json({ error: "Team not found in this auction" }); return; }

  try {
    await db.transaction(async (tx) => {
      const deductResult = await tx.execute(
        sql`UPDATE users SET balance = balance - ${parsedAmount} WHERE id = ${user.id} AND balance >= ${parsedAmount} RETURNING balance`
      );
      if (!deductResult.rows || deductResult.rows.length === 0) {
        throw new Error("Insufficient balance");
      }
      await tx.insert(auctionBidsTable).values({
        auctionId,
        teamId: Number(teamId),
        userId: user.id,
        amount: String(parsedAmount),
      });
    });
  } catch (err: any) {
    if (err?.message === "Insufficient balance") {
      res.status(400).json({ error: "Insufficient balance" }); return;
    }
    throw err;
  }

  res.json({ success: true, message: "Bid placed successfully!" });
});

export default router;
