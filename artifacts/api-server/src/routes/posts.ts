import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { postsTable, usersTable, postLikesTable, postCommentsTable } from "@workspace/db/schema";
import { eq, sql, desc, and } from "drizzle-orm";
import { requireAuth } from "./auth";

const router: IRouter = Router();

const POST_COST_SILVER = 5;

router.get("/posts", requireAuth, async (req: Request, res: Response) => {
  const limit = Math.min(parseInt((req.query.limit as string) || "20"), 50);
  const offset = parseInt((req.query.offset as string) || "0");
  const currentUser = (req as any).user;

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

  const enriched = await Promise.all(posts.map(async (post) => {
    const [likesResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(postLikesTable)
      .where(eq(postLikesTable.postId, post.id));

    const [commentsResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(postCommentsTable)
      .where(eq(postCommentsTable.postId, post.id));

    let isLiked = false;
    if (currentUser?.id) {
      const [like] = await db
        .select({ id: postLikesTable.id })
        .from(postLikesTable)
        .where(and(
          eq(postLikesTable.postId, post.id),
          eq(postLikesTable.userId, currentUser.id),
        ));
      isLiked = !!like;
    }

    return {
      ...post,
      likesCount: likesResult?.count ?? 0,
      commentsCount: commentsResult?.count ?? 0,
      isLiked,
    };
  }));

  res.json(enriched);
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

router.post("/posts/:id/like", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const postId = parseInt(req.params.id);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid post id" }); return; }

  const [existing] = await db
    .select({ id: postLikesTable.id })
    .from(postLikesTable)
    .where(and(eq(postLikesTable.postId, postId), eq(postLikesTable.userId, user.id)));

  if (existing) {
    await db.delete(postLikesTable).where(eq(postLikesTable.id, existing.id));
    res.json({ liked: false });
  } else {
    await db.insert(postLikesTable).values({ postId, userId: user.id });
    res.json({ liked: true });
  }
});

router.get("/posts/:id/comments", requireAuth, async (req: Request, res: Response) => {
  const postId = parseInt(req.params.id);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid post id" }); return; }

  const comments = await db.select({
    id: postCommentsTable.id,
    postId: postCommentsTable.postId,
    userId: postCommentsTable.userId,
    content: postCommentsTable.content,
    createdAt: postCommentsTable.createdAt,
    userName: usersTable.name,
    userHandle: usersTable.handle,
    userAvatar: usersTable.avatar,
  }).from(postCommentsTable)
    .leftJoin(usersTable, eq(postCommentsTable.userId, usersTable.id))
    .where(eq(postCommentsTable.postId, postId))
    .orderBy(postCommentsTable.createdAt);

  res.json(comments);
});

router.post("/posts/:id/comments", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const postId = parseInt(req.params.id);
  if (isNaN(postId)) { res.status(400).json({ error: "Invalid post id" }); return; }

  const { content } = req.body;
  if (!content?.trim()) { res.status(400).json({ error: "Content is required" }); return; }

  const [comment] = await db
    .insert(postCommentsTable)
    .values({ postId, userId: user.id, content: content.trim() })
    .returning();

  res.json({
    ...comment,
    userName: user.name,
    userHandle: user.handle,
    userAvatar: user.avatar,
  });
});

export default router;
