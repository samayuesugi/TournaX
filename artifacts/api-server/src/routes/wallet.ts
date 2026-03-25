import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { addBalanceRequestsTable, withdrawalRequestsTable, hostEarningsTable, usersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "./auth";

const SILVER_TO_GOLD_RATE = 100;
const GOLD_PER_CONVERSION = 10;

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
    silverCoins: user.silverCoins ?? 0,
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
  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) { res.status(400).json({ error: "Amount must be a positive number" }); return; }
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
  if (isNaN(numericAmount) || numericAmount <= 0) { res.status(400).json({ error: "Invalid amount" }); return; }
  try {
    await db.transaction(async (tx) => {
      const result = await tx.execute(
        sql`UPDATE users SET balance = balance - ${numericAmount} WHERE id = ${user.id} AND balance >= ${numericAmount} RETURNING balance`
      );
      if (!result.rows || result.rows.length === 0) {
        throw new Error("Insufficient balance");
      }
      await tx.insert(withdrawalRequestsTable).values({
        userId: user.id,
        amount: String(numericAmount),
        upiId,
        status: "pending",
      });
    });
  } catch (err: any) {
    if (err?.message === "Insufficient balance") {
      res.status(400).json({ error: "Insufficient balance" }); return;
    }
    throw err;
  }
  res.json({ success: true, message: "Withdrawal requested" });
});

router.post("/wallet/convert-silver", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const currentSilver = user.silverCoins ?? 0;
  if (currentSilver < SILVER_TO_GOLD_RATE) {
    res.status(400).json({ error: `You need at least ${SILVER_TO_GOLD_RATE} Silver Coins to convert. You have ${currentSilver}.` });
    return;
  }
  const batches = Math.floor(currentSilver / SILVER_TO_GOLD_RATE);
  const silverToSpend = batches * SILVER_TO_GOLD_RATE;
  const goldToEarn = batches * GOLD_PER_CONVERSION;

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`UPDATE users SET silver_coins = silver_coins - ${silverToSpend}, balance = balance + ${goldToEarn} WHERE id = ${user.id}`
    );
  });

  res.json({ success: true, message: `Converted ${silverToSpend} Silver Coins into ${goldToEarn} Gold Coins!` });
});

export default router;
