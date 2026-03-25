import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { usersTable, referralsTable } from "@workspace/db/schema";
import { eq, sql, ilike } from "drizzle-orm";
import { requireAuth } from "./auth";

const router: IRouter = Router();

router.post("/referral/apply", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (user.role !== "player") {
    res.status(403).json({ error: "Only players can use referral codes" });
    return;
  }

  const existing = await db.select().from(referralsTable).where(eq(referralsTable.referredId, user.id));
  if (existing.length > 0) {
    res.status(400).json({ error: "You have already used a referral code" });
    return;
  }

  const { code } = req.body;
  if (!code?.trim()) {
    res.status(400).json({ error: "Referral code is required" });
    return;
  }

  const [referrer] = await db.select().from(usersTable).where(ilike(usersTable.referralCode, code.trim()));
  if (!referrer) {
    res.status(404).json({ error: "Invalid referral code" });
    return;
  }
  if (referrer.id === user.id) {
    res.status(400).json({ error: "You cannot use your own referral code" });
    return;
  }

  await db.insert(referralsTable).values({
    referrerId: referrer.id,
    referredId: user.id,
  });

  res.json({ success: true, message: `Referral code applied! Play 5 paid matches to unlock your bonus.` });
});

router.get("/referral/stats", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;

  const referrals = await db.select().from(referralsTable).where(eq(referralsTable.referrerId, user.id));
  const total = referrals.length;
  const completed = referrals.filter(r => r.completed).length;
  const pending = total - completed;

  const myReferral = await db.select().from(referralsTable).where(eq(referralsTable.referredId, user.id));
  const usedCode = myReferral.length > 0;
  const myReferralCompleted = myReferral[0]?.completed ?? false;

  const today = new Date().toISOString().slice(0, 10);
  const bonusActive = user.referralBonusUntil ? user.referralBonusUntil >= today : false;

  res.json({
    myCode: user.referralCode,
    totalReferrals: total,
    completedReferrals: completed,
    pendingReferrals: pending,
    usedCode,
    myReferralCompleted,
    bonusActive,
    bonusUntil: user.referralBonusUntil ?? null,
    paidMatchesPlayed: user.paidMatchesPlayed ?? 0,
  });
});

export default router;
