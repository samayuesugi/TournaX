import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { pushSubscriptionsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "./auth";

const router: IRouter = Router();

router.get("/push/vapid-key", (_req: Request, res: Response) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) {
    res.status(500).json({ error: "Push notifications not configured" });
    return;
  }
  res.json({ publicKey: key });
});

router.post("/push/subscribe", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { subscription } = req.body;
  if (!subscription?.endpoint) {
    res.status(400).json({ error: "Invalid subscription" });
    return;
  }
  await db
    .insert(pushSubscriptionsTable)
    .values({
      userId: user.id,
      endpoint: subscription.endpoint,
      subscription,
    })
    .onConflictDoUpdate({
      target: pushSubscriptionsTable.endpoint,
      set: { userId: user.id, subscription },
    });
  res.json({ success: true });
});

router.delete("/push/unsubscribe", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { endpoint } = req.body;
  if (endpoint) {
    await db
      .delete(pushSubscriptionsTable)
      .where(
        and(
          eq(pushSubscriptionsTable.userId, user.id),
          eq(pushSubscriptionsTable.endpoint, endpoint),
        ),
      );
  } else {
    await db
      .delete(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.userId, user.id));
  }
  res.json({ success: true });
});

router.post("/notifications/read-all", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { notificationsTable } = await import("@workspace/db/schema");
  const { sql } = await import("drizzle-orm");
  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(eq(notificationsTable.userId, user.id));
  res.json({ success: true });
});

export default router;
