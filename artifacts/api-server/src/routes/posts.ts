import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { postsTable, usersTable } from "@workspace/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { requireAuth } from "./auth";

const router: IRouter = Router();

const POST_COST_SILVER = 5;

router.get("/posts", requireAuth, async (req: Request, res: Response) => {
  const limit = Math.min(parseInt((req.query.limit as string) || "20"), 50);
  const offset = parseInt((req.query.offset as string) || "0");

  const posts = await db.select({
    id: postsTable.id,
    userId: postsTable.userId,
    imageUrl: postsTable.imageUrl,
    caption: postsTable.caption,
    createdAt: postsTable.createdAt,
    userName: usersTable.name,
    userHandle: usersTable.handle,
    userAvatar: usersTable.avatar,
  }).from(postsTable)
    .leftJoin(usersTable, eq(postsTable.userId, usersTable.id))
    .orderBy(desc(postsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(posts);
});

router.post("/posts", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (user.role !== "player") {
    res.status(403).json({ error: "Only players can post" });
    return;
  }

  const { imageUrl, caption } = req.body;
  if (!imageUrl) {
    res.status(400).json({ error: "imageUrl is required" });
    return;
  }

  const currentSilver = user.silverCoins ?? 0;
  if (currentSilver < POST_COST_SILVER) {
    res.status(400).json({ error: `You need ${POST_COST_SILVER} Silver Coins to post an image. You have ${currentSilver}.` });
    return;
  }

  await db.transaction(async (tx) => {
    const deductResult = await tx.execute(
      sql`UPDATE users SET silver_coins = silver_coins - ${POST_COST_SILVER} WHERE id = ${user.id} AND silver_coins >= ${POST_COST_SILVER} RETURNING silver_coins`
    );
    if (!deductResult.rows || deductResult.rows.length === 0) {
      throw new Error("Insufficient silver coins");
    }
    await tx.insert(postsTable).values({
      userId: user.id,
      imageUrl: String(imageUrl).trim(),
      caption: caption ? String(caption).trim() : null,
    });
  });

  res.json({ success: true, message: `Post shared! ${POST_COST_SILVER} Silver Coins deducted.` });
});

export default router;
