import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { addBalanceRequestsTable, withdrawalRequestsTable, hostEarningsTable, usersTable, matchEscrowTransactionsTable, matchesTable } from "@workspace/db/schema";
import { eq, sql, and, inArray } from "drizzle-orm";
import { requireAuth } from "./auth";

const SILVER_TO_GOLD_RATE = 100;
const GOLD_PER_CONVERSION = 1;
const MIN_ADD_BALANCE_AMOUNT = 10;

const router: IRouter = Router();

router.get("/wallet", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const addHistory = await db.select().from(addBalanceRequestsTable)
    .where(eq(addBalanceRequestsTable.userId, user.id));
  const withdrawHistory = await db.select().from(withdrawalRequestsTable)
    .where(eq(withdrawalRequestsTable.userId, user.id));

  const escrowTxs = await db.select().from(matchEscrowTransactionsTable)
    .where(and(eq(matchEscrowTransactionsTable.userId, user.id), inArray(matchEscrowTransactionsTable.type, ["entry_fee", "prize_payout"])));

  const matchIds = [...new Set(escrowTxs.map(t => t.matchId))];
  let matchCodeMap: Record<number, string> = {};
  if (matchIds.length > 0) {
    const matchRows = await db.select({ id: matchesTable.id, code: matchesTable.code }).from(matchesTable).where(inArray(matchesTable.id, matchIds));
    matchCodeMap = Object.fromEntries(matchRows.map(m => [m.id, m.code]));
  }

  const wonHistory = escrowTxs.filter(t => t.type === "prize_payout").map(t => ({
    id: t.id,
    amount: parseFloat(t.amount as string),
    matchCode: matchCodeMap[t.matchId] ?? String(t.matchId),
    createdAt: t.createdAt?.toISOString() ?? new Date().toISOString(),
  }));

  const spentHistory = escrowTxs.filter(t => t.type === "entry_fee").map(t => ({
    id: t.id,
    amount: parseFloat(t.amount as string),
    matchCode: matchCodeMap[t.matchId] ?? String(t.matchId),
    createdAt: t.createdAt?.toISOString() ?? new Date().toISOString(),
  }));

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
    upiId: process.env.ADMIN_UPI_ID ?? "",
    role: user.role,
    addBalanceHistory: addHistory.map(r => ({
      id: r.id, amount: parseFloat(r.amount as string), status: r.status,
      createdAt: r.createdAt?.toISOString(), note: r.utrNumber,
    })),
    withdrawalHistory: withdrawHistory.map(r => ({
      id: r.id, amount: parseFloat(r.amount as string), status: r.status,
      createdAt: r.createdAt?.toISOString(), note: r.upiId,
    })),
    wonHistory,
    spentHistory,
    earningsHistory,
  });
});

router.post("/wallet/add-balance", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { utrNumber, amount, receiptUrl } = req.body;
  const normalizedUtr = String(utrNumber ?? "").trim().replace(/\s+/g, "").toUpperCase();
  const normalizedReceiptUrl = String(receiptUrl ?? "").trim();

  if (!normalizedUtr || !amount) { res.status(400).json({ error: "UTR and amount required" }); return; }
  if (!/^[A-Z0-9-]{6,30}$/.test(normalizedUtr)) { res.status(400).json({ error: "Please enter a valid UTR/reference number" }); return; }
  if (!normalizedReceiptUrl) { res.status(400).json({ error: "Payment receipt is required" }); return; }
  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || numericAmount < MIN_ADD_BALANCE_AMOUNT) { res.status(400).json({ error: `Minimum add amount is ${MIN_ADD_BALANCE_AMOUNT} Gold Coins` }); return; }

  const [existingUtr] = await db.select({ id: addBalanceRequestsTable.id }).from(addBalanceRequestsTable).where(eq(addBalanceRequestsTable.utrNumber, normalizedUtr));
  if (existingUtr) { res.status(409).json({ error: "This UTR/reference number has already been submitted" }); return; }

  try {
    await db.insert(addBalanceRequestsTable).values({
      userId: user.id,
      utrNumber: normalizedUtr,
      amount: String(numericAmount),
      receiptUrl: normalizedReceiptUrl,
      status: "pending",
    });
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "This UTR/reference number has already been submitted" });
      return;
    }
    throw err;
  }
  res.json({ success: true, message: "Request submitted successfully" });
});

router.post("/wallet/withdraw", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { amount, upiId } = req.body;
  if (!amount || !upiId) { res.status(400).json({ error: "Amount and UPI ID required" }); return; }
  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) { res.status(400).json({ error: "Invalid amount" }); return; }
  if (numericAmount < 10) { res.status(400).json({ error: "Minimum withdrawal amount is 10 Gold Coins" }); return; }
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

  const result = await db.transaction(async (tx) => {
    return tx.execute(
      sql`UPDATE users SET silver_coins = silver_coins - ${silverToSpend}, balance = balance + ${goldToEarn} WHERE id = ${user.id} AND silver_coins >= ${silverToSpend} RETURNING id`
    );
  });

  if (!result.rows || result.rows.length === 0) {
    res.status(400).json({ error: "Insufficient Silver Coins. Please try again." });
    return;
  }

  res.json({ success: true, message: `Converted ${silverToSpend} Silver Coins into ${goldToEarn} Gold Coins!` });
});

export default router;
