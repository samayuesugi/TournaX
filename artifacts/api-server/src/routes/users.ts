import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { usersTable, followsTable, squadMembersTable, complaintsTable, matchesTable, matchParticipantsTable, hostReviewsTable } from "@workspace/db/schema";
import { eq, and, ilike, or, sql, avg, inArray } from "drizzle-orm";
import { requireAuth } from "./auth";

async function getHostRatings(hostIds: number[]): Promise<Map<number, number>> {
  if (hostIds.length === 0) return new Map();
  const result = await db
    .select({ hostId: hostReviewsTable.hostId, avg: avg(hostReviewsTable.rating) })
    .from(hostReviewsTable)
    .where(inArray(hostReviewsTable.hostId, hostIds))
    .groupBy(hostReviewsTable.hostId);
  const map = new Map<number, number>();
  for (const row of result) {
    if (row.avg) map.set(row.hostId, parseFloat(row.avg as string));
  }
  return map;
}

async function getMatchCounts(userIds: number[]): Promise<Map<number, number>> {
  if (userIds.length === 0) return new Map();
  const result = await db
    .select({
      userId: matchParticipantsTable.userId,
      count: sql<number>`count(*)::int`,
    })
    .from(matchParticipantsTable)
    .where(inArray(matchParticipantsTable.userId, userIds))
    .groupBy(matchParticipantsTable.userId);
  const map = new Map<number, number>();
  for (const row of result) {
    map.set(row.userId, row.count);
  }
  return map;
}

const router: IRouter = Router();

router.get("/users/explore", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { search } = req.query;

  const [admins, hosts, players, myFollows] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.role, "admin")),
    search
      ? db.select().from(usersTable).where(
          and(eq(usersTable.role, "host"), or(ilike(usersTable.handle, `%${search}%`), ilike(usersTable.name, `%${search}%`)))
        )
      : db.select().from(usersTable).where(eq(usersTable.role, "host")),
    search
      ? db.select().from(usersTable).where(
          and(eq(usersTable.role, "player"), or(ilike(usersTable.handle, `%${search}%`), ilike(usersTable.name, `%${search}%`)))
        )
      : db.select().from(usersTable).where(eq(usersTable.role, "player")),
    db.select().from(followsTable).where(eq(followsTable.followerId, user.id)),
  ]);

  const followedUserIds = new Set(myFollows.map((f) => f.followingId));

  const allUserIds = [...admins, ...hosts.slice(0, 5), ...players].map((u) => u.id);
  const hostAndAdminIds = [...admins, ...hosts.slice(0, 5)].map((u) => u.id);

  const [matchCountMap, ratingMap] = await Promise.all([
    getMatchCounts(allUserIds),
    getHostRatings(hostAndAdminIds),
  ]);

  const serialize = (u: typeof usersTable.$inferSelect) => ({
    id: u.id,
    name: u.name,
    handle: u.handle,
    avatar: u.avatar || "🔥",
    role: u.role,
    followersCount: u.followersCount,
    followingCount: u.followingCount,
    rating: (u.role === "host" || u.role === "admin") ? (ratingMap.get(u.id) ?? null) : null,
    matchesCount: matchCountMap.get(u.id) ?? 0,
    isFollowing: followedUserIds.has(u.id),
    upcomingMatches: [],
    activeMatches: [],
  });

  const adminProfiles = admins.map(serialize);
  const hostProfiles = hosts.slice(0, 5).map(serialize);
  const recommendedHosts = [...adminProfiles, ...hostProfiles];

  const mostActivePlayers = players
    .map((p) => ({ user: p, matchesCount: matchCountMap.get(p.id) ?? 0 }))
    .sort((a, b) => b.matchesCount - a.matchesCount)
    .slice(0, 10)
    .map(({ user: u }) => serialize(u));

  res.json({ recommendedHosts, mostActivePlayers });
});

router.get("/users/me/squad", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const squad = await db.select().from(squadMembersTable).where(eq(squadMembersTable.userId, user.id));
  res.json(squad.map(s => ({ id: s.id, name: s.name, uid: s.uid })));
});

router.post("/users/me/squad", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { name, uid } = req.body;
  const existing = await db.select().from(squadMembersTable).where(eq(squadMembersTable.userId, user.id));
  if (existing.length >= 6) {
    return res.status(400).json({ error: "Squad limit reached. Maximum 6 members allowed." });
  }
  const [member] = await db.insert(squadMembersTable).values({ userId: user.id, name, uid }).returning();
  res.json({ id: member.id, name: member.name, uid: member.uid });
});

router.delete("/users/me/squad/:memberId", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const memberId = parseInt(req.params.memberId);
  const [member] = await db.select().from(squadMembersTable)
    .where(and(eq(squadMembersTable.id, memberId), eq(squadMembersTable.userId, user.id)));
  if (!member) { res.status(404).json({ error: "Squad member not found" }); return; }
  await db.delete(squadMembersTable).where(eq(squadMembersTable.id, memberId));
  res.json({ success: true });
});

router.put("/users/me/profile", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { name, handle, avatar, instagram, discord, x, youtube, twitch } = req.body;
  const updateData: any = {};
  if (name) updateData.name = name;
  if (handle) updateData.handle = handle;
  if (avatar) updateData.avatar = avatar;
  updateData.instagram = instagram ?? null;
  updateData.discord = discord ?? null;
  updateData.x = x ?? null;
  if (user.role === "host" || user.role === "admin") {
    updateData.youtube = youtube ?? null;
    updateData.twitch = twitch ?? null;
  }
  const [updated] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, user.id)).returning();
  res.json({
    id: updated.id, email: updated.email, name: updated.name, handle: updated.handle,
    avatar: updated.avatar, game: updated.game, gameUid: updated.gameUid, role: updated.role,
    balance: parseFloat(updated.balance as string), status: updated.status, profileSetup: updated.profileSetup,
    followersCount: updated.followersCount, followingCount: updated.followingCount,
    instagram: updated.instagram, discord: updated.discord, x: updated.x,
    youtube: updated.youtube, twitch: updated.twitch,
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
  if (senderRole === "player" && recipientRole === "admin") return false;
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
  const { subject, description, hostHandle, imageUrl } = req.body;
  if (!subject || !description?.trim()) {
    res.status(400).json({ error: "Subject and description required" }); return;
  }
  try {
    await db.insert(complaintsTable).values({
      userId: user.id,
      subject,
      description: description.trim(),
      hostHandle: hostHandle?.trim() || null,
      imageUrl: imageUrl || null,
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to save complaint. Please try again." });
  }
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
  const ratingMap = await getHostRatings([user.id]);

  res.json({
    id: user.id,
    name: user.name,
    handle: user.handle,
    avatar: user.avatar || "🔥",
    role: user.role,
    game: user.game,
    followersCount: user.followersCount,
    followingCount: user.followingCount,
    rating: ratingMap.get(user.id) ?? null,
    matchesCount: hostedMatches.length,
    isFollowing: !!follow,
    instagram: user.instagram,
    discord: user.discord,
    x: user.x,
    youtube: user.youtube,
    twitch: user.twitch,
    upcomingMatches: upcomingMatches.map(m => ({
      id: m.id, code: m.code, game: m.game, mode: m.mode, teamSize: m.teamSize,
      entryFee: parseFloat(m.entryFee as string), showcasePrizePool: parseFloat(m.showcasePrizePool as string),
      startTime: m.startTime?.toISOString(), status: m.status, slots: m.slots, filledSlots: m.filledSlots,
      hostId: m.hostId, thumbnailImage: m.thumbnailImage,
    })),
    activeMatches: activeMatches.map(m => ({
      id: m.id, code: m.code, game: m.game, mode: m.mode, teamSize: m.teamSize,
      entryFee: parseFloat(m.entryFee as string), showcasePrizePool: parseFloat(m.showcasePrizePool as string),
      startTime: m.startTime?.toISOString(), status: m.status, slots: m.slots, filledSlots: m.filledSlots,
      hostId: m.hostId, thumbnailImage: m.thumbnailImage,
    })),
  });
});

router.get("/users/:handle/followers", requireAuth, async (req: Request, res: Response) => {
  const { handle } = req.params;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.handle, handle));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const follows = await db.select().from(followsTable).where(eq(followsTable.followingId, user.id));
  const followerIds = follows.map(f => f.followerId);
  if (followerIds.length === 0) { res.json([]); return; }

  const followers = await db.select({
    id: usersTable.id, name: usersTable.name, handle: usersTable.handle,
    avatar: usersTable.avatar, role: usersTable.role,
  }).from(usersTable).where(inArray(usersTable.id, followerIds));

  res.json(followers.map(u => ({
    id: u.id, name: u.name, handle: u.handle,
    avatar: u.avatar || "🔥", role: u.role,
  })));
});

router.get("/users/:handle/following", requireAuth, async (req: Request, res: Response) => {
  const { handle } = req.params;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.handle, handle));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const follows = await db.select().from(followsTable).where(eq(followsTable.followerId, user.id));
  const followingIds = follows.map(f => f.followingId);
  if (followingIds.length === 0) { res.json([]); return; }

  const following = await db.select({
    id: usersTable.id, name: usersTable.name, handle: usersTable.handle,
    avatar: usersTable.avatar, role: usersTable.role,
  }).from(usersTable).where(inArray(usersTable.id, followingIds));

  res.json(following.map(u => ({
    id: u.id, name: u.name, handle: u.handle,
    avatar: u.avatar || "🔥", role: u.role,
  })));
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
