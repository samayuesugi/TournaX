import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { usersTable, followsTable, squadMembersTable, complaintsTable, matchesTable, matchParticipantsTable } from "@workspace/db/schema";
import { eq, and, ilike, or, sql } from "drizzle-orm";
import { requireAuth } from "./auth";

const router: IRouter = Router();

router.get("/users/explore", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { search } = req.query;

  let hostsQuery = db.select().from(usersTable).where(eq(usersTable.role, "host"));
  const hosts = await hostsQuery;

  let playersQuery = db.select().from(usersTable).where(eq(usersTable.role, "player"));
  if (search) {
    playersQuery = db.select().from(usersTable).where(
      and(
        eq(usersTable.role, "player"),
        or(ilike(usersTable.handle, `%${search}%`), ilike(usersTable.name, `%${search}%`))
      )
    ) as any;
  }
  const players = await playersQuery;

  const followedUserIds = new Set<number>();
  const myFollows = await db.select().from(followsTable).where(eq(followsTable.followerId, user.id));
  myFollows.forEach(f => followedUserIds.add(f.followingId));

  const serializeProfile = async (u: typeof usersTable.$inferSelect, matchCount?: number) => {
    const matchesCount = matchCount ?? (await db.select().from(matchParticipantsTable).where(eq(matchParticipantsTable.userId, u.id))).length;
    return {
      id: u.id,
      name: u.name,
      handle: u.handle,
      avatar: u.avatar || "🔥",
      role: u.role,
      followersCount: u.followersCount,
      followingCount: u.followingCount,
      rating: null,
      matchesCount,
      isFollowing: followedUserIds.has(u.id),
      upcomingMatches: [],
      activeMatches: [],
    };
  };

  const recommendedHosts = await Promise.all(hosts.slice(0, 5).map(h => serializeProfile(h)));
  const mostActivePlayers = (await Promise.all(players.map(async (p) => {
    const participations = await db.select().from(matchParticipantsTable).where(eq(matchParticipantsTable.userId, p.id));
    return { user: p, matchesCount: participations.length };
  }))).sort((a, b) => b.matchesCount - a.matchesCount)
    .slice(0, 10)
    .map(({ user: u, matchesCount }) => serializeProfile(u, matchesCount));

  res.json({ recommendedHosts, mostActivePlayers: await Promise.all(mostActivePlayers) });
});

router.get("/users/me/squad", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const squad = await db.select().from(squadMembersTable).where(eq(squadMembersTable.userId, user.id));
  res.json(squad.map(s => ({ id: s.id, name: s.name, uid: s.uid })));
});

router.post("/users/me/squad", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { name, uid } = req.body;
  const [member] = await db.insert(squadMembersTable).values({ userId: user.id, name, uid }).returning();
  res.json({ id: member.id, name: member.name, uid: member.uid });
});

router.put("/users/me/profile", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { name, handle, avatar } = req.body;
  const updateData: any = {};
  if (name) updateData.name = name;
  if (handle) updateData.handle = handle;
  if (avatar) updateData.avatar = avatar;
  const [updated] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, user.id)).returning();
  res.json({
    id: updated.id, email: updated.email, name: updated.name, handle: updated.handle,
    avatar: updated.avatar, game: updated.game, gameUid: updated.gameUid, role: updated.role,
    balance: parseFloat(updated.balance as string), status: updated.status, profileSetup: updated.profileSetup,
    followersCount: updated.followersCount, followingCount: updated.followingCount,
  });
});

router.get("/notifications", requireAuth, async (req: Request, res: Response) => {
  const { notificationsTable } = await import("@workspace/db/schema");
  const user = (req as any).user;
  const notifs = await db.select().from(notificationsTable).where(eq(notificationsTable.userId, user.id));
  res.json(notifs.map(n => ({
    id: n.id, type: n.type, message: n.message, read: n.read, createdAt: n.createdAt?.toISOString(),
  })));
});

function canChat(senderRole: string, recipientRole: string): boolean {
  return true;
}

router.get("/conversations", requireAuth, async (req: Request, res: Response) => {
  const { messagesTable } = await import("@workspace/db/schema");
  const user = (req as any).user;
  const sent = await db.select().from(messagesTable).where(eq(messagesTable.fromUserId, user.id));
  const received = await db.select().from(messagesTable).where(eq(messagesTable.toUserId, user.id));

  const partnerIds = new Set<number>();
  sent.forEach(m => partnerIds.add(m.toUserId));
  received.forEach(m => partnerIds.add(m.fromUserId));

  const conversations = await Promise.all(Array.from(partnerIds).map(async (partnerId) => {
    const [partner] = await db.select().from(usersTable).where(eq(usersTable.id, partnerId));
    if (!partner) return null;
    const allMessages = [
      ...sent.filter(m => m.toUserId === partnerId),
      ...received.filter(m => m.fromUserId === partnerId),
    ].sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
    const last = allMessages[0];
    const unreadCount = received.filter(m => m.fromUserId === partnerId && !m.read).length;
    return {
      userId: partner.id,
      name: partner.name || partner.handle || partner.email,
      handle: partner.handle || "",
      avatar: partner.avatar || "🔥",
      role: partner.role,
      lastMessage: last?.content || "",
      lastMessageAt: last?.createdAt?.toISOString() || "",
      unreadCount,
    };
  }));

  const result = conversations
    .filter(Boolean)
    .sort((a, b) => new Date(b!.lastMessageAt).getTime() - new Date(a!.lastMessageAt).getTime());

  res.json(result);
});

router.get("/conversations/:userId", requireAuth, async (req: Request, res: Response) => {
  const { messagesTable } = await import("@workspace/db/schema");
  const user = (req as any).user;
  const partnerId = Number(req.params.userId);
  const [partner] = await db.select().from(usersTable).where(eq(usersTable.id, partnerId));
  if (!partner) { res.status(404).json({ error: "User not found" }); return; }

  const msgs = await db.select().from(messagesTable).where(
    or(
      and(eq(messagesTable.fromUserId, user.id), eq(messagesTable.toUserId, partnerId)),
      and(eq(messagesTable.fromUserId, partnerId), eq(messagesTable.toUserId, user.id))
    )
  );
  msgs.sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());
  res.json(msgs.map(m => ({
    id: m.id,
    fromUserId: m.fromUserId,
    toUserId: m.toUserId,
    content: m.content,
    createdAt: m.createdAt?.toISOString(),
    read: m.read,
  })));
});

router.put("/conversations/:userId/read", requireAuth, async (req: Request, res: Response) => {
  const { messagesTable } = await import("@workspace/db/schema");
  const user = (req as any).user;
  const partnerId = Number(req.params.userId);
  await db.update(messagesTable)
    .set({ read: true })
    .where(and(eq(messagesTable.fromUserId, partnerId), eq(messagesTable.toUserId, user.id)));
  res.json({ success: true });
});

router.post("/messages", requireAuth, async (req: Request, res: Response) => {
  const { messagesTable } = await import("@workspace/db/schema");
  const user = (req as any).user;
  const { toUserId, content } = req.body;
  if (!toUserId || !content?.trim()) { res.status(400).json({ error: "toUserId and content required" }); return; }
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, Number(toUserId)));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (!canChat(user.role, target.role)) {
    res.status(403).json({ error: "You are not allowed to message this user" }); return;
  }
  if (user.id === target.id) { res.status(400).json({ error: "Cannot message yourself" }); return; }
  await db.insert(messagesTable).values({ fromUserId: user.id, toUserId: target.id, content: content.trim() });
  res.json({ success: true });
});

router.post("/complaints", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { subject, description } = req.body;
  await db.insert(complaintsTable).values({ userId: user.id, subject, description });
  res.json({ success: true });
});

router.get("/users/:handle", requireAuth, async (req: Request, res: Response) => {
  const currentUser = (req as any).user;
  const { handle } = req.params;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.handle, handle));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const [follow] = await db.select().from(followsTable).where(
    and(eq(followsTable.followerId, currentUser.id), eq(followsTable.followingId, user.id))
  );

  const hostedMatches = await db.select().from(matchesTable).where(eq(matchesTable.hostId, user.id));
  const upcomingMatches = hostedMatches.filter(m => m.status === "upcoming");
  const activeMatches = hostedMatches.filter(m => m.status === "live");

  res.json({
    id: user.id,
    name: user.name,
    handle: user.handle,
    avatar: user.avatar || "🔥",
    role: user.role,
    followersCount: user.followersCount,
    followingCount: user.followingCount,
    rating: null,
    matchesCount: hostedMatches.length,
    isFollowing: !!follow,
    upcomingMatches: upcomingMatches.map(m => ({
      id: m.id, code: m.code, game: m.game, mode: m.mode, teamSize: m.teamSize,
      entryFee: parseFloat(m.entryFee as string), prizePool: parseFloat(m.prizePool as string),
      startTime: m.startTime?.toISOString(), status: m.status, slots: m.slots, filledSlots: m.filledSlots,
      hostId: m.hostId,
    })),
    activeMatches: activeMatches.map(m => ({
      id: m.id, code: m.code, game: m.game, mode: m.mode, teamSize: m.teamSize,
      entryFee: parseFloat(m.entryFee as string), prizePool: parseFloat(m.prizePool as string),
      startTime: m.startTime?.toISOString(), status: m.status, slots: m.slots, filledSlots: m.filledSlots,
      hostId: m.hostId,
    })),
  });
});

router.post("/users/:handle/follow", requireAuth, async (req: Request, res: Response) => {
  const currentUser = (req as any).user;
  const { handle } = req.params;
  const [target] = await db.select().from(usersTable).where(eq(usersTable.handle, handle));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  const existing = await db.select().from(followsTable).where(
    and(eq(followsTable.followerId, currentUser.id), eq(followsTable.followingId, target.id))
  );
  if (existing.length > 0) { res.json({ success: true }); return; }
  await db.insert(followsTable).values({ followerId: currentUser.id, followingId: target.id });
  await db.execute(sql`UPDATE users SET followers_count = followers_count + 1 WHERE id = ${target.id}`);
  await db.execute(sql`UPDATE users SET following_count = following_count + 1 WHERE id = ${currentUser.id}`);
  res.json({ success: true });
});

router.post("/users/:handle/unfollow", requireAuth, async (req: Request, res: Response) => {
  const currentUser = (req as any).user;
  const { handle } = req.params;
  const [target] = await db.select().from(usersTable).where(eq(usersTable.handle, handle));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  await db.delete(followsTable).where(
    and(eq(followsTable.followerId, currentUser.id), eq(followsTable.followingId, target.id))
  );
  await db.execute(sql`UPDATE users SET followers_count = GREATEST(0, followers_count - 1) WHERE id = ${target.id}`);
  await db.execute(sql`UPDATE users SET following_count = GREATEST(0, following_count - 1) WHERE id = ${currentUser.id}`);
  res.json({ success: true });
});

export default router;
