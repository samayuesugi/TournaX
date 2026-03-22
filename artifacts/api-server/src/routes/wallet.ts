import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { addBalanceRequestsTable, withdrawalRequestsTable, hostEarningsTable, usersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "./auth";

const router: IRouter = Router();

router.get("/wallet", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const addHistory = await db.select().from(addBalanceRequestsTable)
    .where(eq(addBalanceRequestsTable.userId, user.id));
  const withdrawHistory = await db.select().from(withdrawalRequestsTable)
    .where(eq(withdrawalRequestsTable.userId, user.id));

  let earningsHistory: { id: number; matchCode: string; amount: number; createdAt: string }[] = [];
  if (user.role === "host" || user.role === "admin") {
    const earnings = await db.select().from(hostEarningsTable)
      .where(eq(hostEarningsTable.hostId, user.id));
    earningsHistory = earnings.map(e => ({
      id: e.id,
      matchCode: e.matchCode,
      amount: parseFloat(e.amount as string),
      createdAt: e.createdAt?.toISOString() ?? new Date().toISOString(),
    }));
  }

  res.json({
    balance: parseFloat(user.balance as string),
    upiId: "9971040244@ptaxis",
    role: user.role,
    addBalanceHistory: addHistory.map(r => ({
      id: r.id, amount: parseFloat(r.amount as string), status: r.status,
      createdAt: r.createdAt?.toISOString(), note: r.utrNumber,
    })),
    withdrawalHistory: withdrawHistory.map(r => ({
      id: r.id, amount: parseFloat(r.amount as string), status: r.status,
      createdAt: r.createdAt?.toISOString(), note: r.upiId,
    })),
    earningsHistory,
  });
});

router.post("/wallet/add-balance", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { utrNumber, amount, receiptUrl } = req.body;
  if (!utrNumber || !amount) { res.status(400).json({ error: "UTR and amount required" }); return; }
  await db.insert(addBalanceRequestsTable).values({
    userId: user.id,
    utrNumber,
    amount: String(amount),
    receiptUrl: receiptUrl || null,
    status: "pending",
  });
  res.json({ success: true, message: "Request submitted successfully" });
});

router.post("/wallet/withdraw", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { amount, upiId } = req.body;
  if (!amount || !upiId) { res.status(400).json({ error: "Amount and UPI ID required" }); return; }
  const numericAmount = Number(amount);
  if (numericAmount <= 0) { res.status(400).json({ error: "Invalid amount" }); return; }
  const result = await db.execute(
    sql`UPDATE users SET balance = balance - ${numericAmount} WHERE id = ${user.id} AND balance >= ${numericAmount} RETURNING balance`
  );
  if (!result.rows || result.rows.length === 0) {
    res.status(400).json({ error: "Insufficient balance" }); return;
  }
  await db.insert(withdrawalRequestsTable).values({
    userId: user.id,
    amount: String(amount),
    upiId,
    status: "pending",
  });
  res.json({ success: true, message: "Withdrawal requested" });
});

export default router;
