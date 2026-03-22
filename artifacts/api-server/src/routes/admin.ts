import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  usersTable, matchesTable, matchParticipantsTable,
  addBalanceRequestsTable, withdrawalRequestsTable, complaintsTable
} from "@workspace/db/schema";
import { eq, and, ilike, or, sql } from "drizzle-orm";
import { requireAuth } from "./auth";
import crypto from "crypto";

const router: IRouter = Router();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "tournax_salt").digest("hex");
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
  const totalRevenue = completedMatches.reduce((sum, m) => sum + parseFloat(m.prizePool as string) * 0.1, 0);
  const platformFees = completedMatches.reduce((sum, m) => sum + parseFloat(m.prizePool as string) * 0.05, 0);

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
    hostList: hosts.map(h => ({ id: h.id, email: h.email, name: h.name, role: h.role })),
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

router.post("/admin/players/:id/add-balance", requireAdmin, async (req: Request, res: Response) => {
  const { amount } = req.body;
  const parsedAmount = parseFloat(String(amount));
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    res.status(400).json({ error: "Invalid amount" }); return;
  }
  await db.execute(sql`UPDATE users SET balance = balance + ${parsedAmount} WHERE id = ${Number(req.params.id)}`);
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
      createdAt: r.createdAt?.toISOString(),
    };
  }));
  res.json(result);
});

router.post("/admin/finance/add-requests/:id/approve", requireAdmin, async (req: Request, res: Response) => {
  const [request] = await db.select().from(addBalanceRequestsTable).where(eq(addBalanceRequestsTable.id, Number(req.params.id)));
  if (!request) { res.status(404).json({ error: "Request not found" }); return; }
  await db.update(addBalanceRequestsTable).set({ status: "approved" }).where(eq(addBalanceRequestsTable.id, request.id));
  await db.execute(sql`UPDATE users SET balance = balance + ${request.amount} WHERE id = ${request.userId}`);
  res.json({ success: true });
});

router.post("/admin/finance/add-requests/:id/reject", requireAdmin, async (req: Request, res: Response) => {
  await db.update(addBalanceRequestsTable).set({ status: "rejected" }).where(eq(addBalanceRequestsTable.id, Number(req.params.id)));
  res.json({ success: true });
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
  await db.update(withdrawalRequestsTable).set({ status: "approved" }).where(eq(withdrawalRequestsTable.id, Number(req.params.id)));
  res.json({ success: true });
});

router.post("/admin/finance/withdrawals/:id/reject", requireAdmin, async (req: Request, res: Response) => {
  const [request] = await db.select().from(withdrawalRequestsTable).where(eq(withdrawalRequestsTable.id, Number(req.params.id)));
  if (!request) { res.status(404).json({ error: "Not found" }); return; }
  await db.update(withdrawalRequestsTable).set({ status: "rejected" }).where(eq(withdrawalRequestsTable.id, request.id));
  await db.execute(sql`UPDATE users SET balance = balance + ${request.amount} WHERE id = ${request.userId}`);
  res.json({ success: true });
});

router.post("/admin/create-host", requireAdmin, async (req: Request, res: Response) => {
  const { email, password, name } = req.body;
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing) { res.status(400).json({ error: "Email already exists" }); return; }
  await db.insert(usersTable).values({
    email, password: hashPassword(password), name, role: "host", status: "active", profileSetup: true, balance: "0",
  });
  res.json({ success: true });
});

router.post("/admin/create-admin", requireAdmin, async (req: Request, res: Response) => {
  const { email, password, name } = req.body;
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing) { res.status(400).json({ error: "Email already exists" }); return; }
  await db.insert(usersTable).values({
    email, password: hashPassword(password), name, role: "admin", status: "active", profileSetup: true, balance: "0",
  });
  res.json({ success: true });
});

router.get("/admin/complaints", requireAdmin, async (req: Request, res: Response) => {
  const complaints = await db.select().from(complaintsTable);
  const result = await Promise.all(complaints.map(async c => {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, c.userId));
    return {
      id: c.id, userId: c.userId, userName: user?.name || user?.email,
      subject: c.subject, description: c.description, createdAt: c.createdAt?.toISOString(),
    };
  }));
  res.json(result);
});

export default router;
