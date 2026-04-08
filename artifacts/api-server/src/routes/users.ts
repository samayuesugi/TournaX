import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { usersTable, followsTable, squadMembersTable, complaintsTable, matchesTable, matchParticipantsTable, hostReviewsTable, messagesTable, messageReactionsTable, esportsStatsTable, squadRequestsTable, notificationsTable } from "@workspace/db/schema";
import { eq, and, ilike, or, sql, avg, inArray, desc } from "drizzle-orm";
import { requireAuth } from "./auth";
import { getIO } from "../lib/socket";

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
  const userGame = user.game as string | null;

  const hostFilter = userGame
    ? and(eq(usersTable.role, "host"), eq(usersTable.game, userGame))
    : eq(usersTable.role, "host");

  const [admins, hosts, players, myFollows] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.role, "admin")),
    search
      ? db.select().from(usersTable).where(
          and(hostFilter, or(ilike(usersTable.handle, `%${search}%`), ilike(usersTable.name, `%${search}%`)))
        )
      : db.select().from(usersTable).where(hostFilter),
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

router.get("/users/search", requireAuth, async (req: Request, res: Response) => {
  const currentUser = (req as any).user;
  const q = String(req.query.q ?? "").trim();
  if (!q) { res.json([]); return; }
  const searchFilter = or(
    ilike(usersTable.handle, `%${q}%`),
    ilike(usersTable.name, `%${q}%`)
  );
  const gameFilter = currentUser.game
    ? and(searchFilter, eq(usersTable.game, currentUser.game))
    : searchFilter;
  const results = await db.select().from(usersTable).where(gameFilter);
  res.json(
    results
      .filter((u) => u.id !== currentUser.id)
      .slice(0, 20)
      .map((u) => ({
        id: u.id,
        name: u.name,
        handle: u.handle,
        avatar: u.avatar,
        role: u.role,
        game: u.game,
        gameUid: u.gameUid,
      }))
  );
});

router.get("/users/me/squad", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const squad = await db.select().from(squadMembersTable).where(eq(squadMembersTable.userId, user.id));
  const linkedIds = squad.map(s => s.linkedUserId).filter(Boolean) as number[];
  const linkedUsers = linkedIds.length > 0
    ? await db.select({ id: usersTable.id, avatar: usersTable.avatar, handle: usersTable.handle }).from(usersTable).where(inArray(usersTable.id, linkedIds))
    : [];
  const linkedMap = new Map(linkedUsers.map(u => [u.id, u]));
  res.json(squad.map(s => {
    const lu = s.linkedUserId ? linkedMap.get(s.linkedUserId) : null;
    return { id: s.id, name: s.name, uid: s.uid, game: s.game ?? null, role: s.role ?? null, isBackup: s.isBackup, linkedUserId: s.linkedUserId ?? null, linkedAvatar: lu?.avatar ?? null, linkedHandle: lu?.handle ?? null };
  }));
});

router.post("/users/me/squad", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { name, uid, game, role, isBackup, linkedUserId } = req.body;
  const squadGame = game || user.game || null;
  const existing = await db.select().from(squadMembersTable).where(
    and(eq(squadMembersTable.userId, user.id), eq(squadMembersTable.game, squadGame))
  );
  const mainCount = existing.filter(m => !m.isBackup).length;
  const backupCount = existing.filter(m => m.isBackup).length;
  if (isBackup && backupCount >= 2) return res.status(400).json({ error: "Maximum 2 backup members allowed." });
  if (!isBackup && mainCount >= 4) return res.status(400).json({ error: "Maximum 4 main members allowed." });
  let linkedUser = null;
  if (linkedUserId) {
    [linkedUser] = await db.select().from(usersTable).where(eq(usersTable.id, linkedUserId));
    if (!linkedUser) return res.status(400).json({ error: "Linked user not found." });
  }
  const [member] = await db.insert(squadMembersTable).values({
    userId: user.id, name: name || linkedUser?.name || "Player",
    uid: uid || linkedUser?.gameUid || "—", game: squadGame,
    role: role ?? null, isBackup: isBackup ?? false,
    linkedUserId: linkedUserId ?? null,
  }).returning();
  res.json({ id: member.id, name: member.name, uid: member.uid, game: member.game ?? null, role: member.role ?? null, isBackup: member.isBackup, linkedUserId: member.linkedUserId ?? null });
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

router.get("/users/me/squad-requests", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const requests = await db.select().from(squadRequestsTable)
    .where(and(eq(squadRequestsTable.toUserId, user.id), eq(squadRequestsTable.status, "pending")));
  const fromIds = requests.map(r => r.fromUserId);
  const fromUsers = fromIds.length > 0
    ? await db.select({ id: usersTable.id, name: usersTable.name, handle: usersTable.handle, avatar: usersTable.avatar }).from(usersTable).where(inArray(usersTable.id, fromIds))
    : [];
  const fromMap = new Map(fromUsers.map(u => [u.id, u]));
  res.json(requests.map(r => {
    const from = fromMap.get(r.fromUserId);
    return { id: r.id, game: r.game, role: r.role, isBackup: r.isBackup, status: r.status, createdAt: r.createdAt?.toISOString(), fromUserId: r.fromUserId, fromName: from?.name ?? null, fromHandle: from?.handle ?? null, fromAvatar: from?.avatar ?? null };
  }));
});

router.post("/users/:handle/squad-request", requireAuth, async (req: Request, res: Response) => {
  const currentUser = (req as any).user;
  const { handle } = req.params;
  const { game, role, isBackup } = req.body;
  if (!game) { res.status(400).json({ error: "Game is required" }); return; }
  const [target] = await db.select().from(usersTable).where(eq(usersTable.handle, handle));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (target.id === currentUser.id) { res.status(400).json({ error: "Cannot invite yourself" }); return; }
  const existing = await db.select().from(squadRequestsTable).where(
    and(eq(squadRequestsTable.fromUserId, currentUser.id), eq(squadRequestsTable.toUserId, target.id), eq(squadRequestsTable.status, "pending"))
  );
  if (existing.length > 0) { res.status(400).json({ error: "Already sent a pending invite to this player" }); return; }
  await db.insert(squadRequestsTable).values({ fromUserId: currentUser.id, toUserId: target.id, game, role: role ?? null, isBackup: isBackup ?? false, status: "pending" });
  await db.insert(notificationsTable).values({ userId: target.id, type: "squad_invite", message: `${currentUser.name || currentUser.handle} invited you to join their squad for ${game}!` });
  try { getIO().to(`user-${target.id}`).emit("notification"); } catch {}
  res.json({ success: true });
});

router.put("/users/me/squad-requests/:requestId", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const requestId = parseInt(req.params.requestId);
  const { action } = req.body;
  if (!["accept", "reject"].includes(action)) { res.status(400).json({ error: "Action must be accept or reject" }); return; }
  const [request] = await db.select().from(squadRequestsTable)
    .where(and(eq(squadRequestsTable.id, requestId), eq(squadRequestsTable.toUserId, user.id)));
  if (!request) { res.status(404).json({ error: "Request not found" }); return; }
  await db.update(squadRequestsTable).set({ status: action === "accept" ? "accepted" : "rejected" }).where(eq(squadRequestsTable.id, requestId));
  if (action === "accept") {
    await db.update(usersTable).set({ isEsportsPlayer: true }).where(eq(usersTable.id, user.id));
    const existing = await db.select().from(squadMembersTable).where(eq(squadMembersTable.userId, request.fromUserId));
    const mainCount = existing.filter((m: any) => !m.isBackup && m.game === request.game).length;
    const backupCount = existing.filter((m: any) => m.isBackup && m.game === request.game).length;
    if ((request.isBackup && backupCount < 2) || (!request.isBackup && mainCount < 4)) {
      await db.insert(squadMembersTable).values({
        userId: request.fromUserId, name: user.name || user.handle || "Player",
        uid: user.gameUid || "—", game: request.game, role: request.role ?? null,
        isBackup: request.isBackup, linkedUserId: user.id,
      });
    }
    await db.insert(notificationsTable).values({ userId: request.fromUserId, type: "squad_accepted", message: `${user.name || user.handle} accepted your squad invite for ${request.game}!` });
    try { getIO().to(`user-${request.fromUserId}`).emit("notification"); } catch {}
  }
  res.json({ success: true });
});

router.get("/users/:handle/has-played-with", requireAuth, async (req: Request, res: Response) => {
  const currentUser = (req as any).user;
  const { handle } = req.params;
  const [host] = await db.select().from(usersTable).where(eq(usersTable.handle, handle));
  if (!host) { res.json({ hasPlayed: false }); return; }
  const hostedMatchIds = (await db.select({ id: matchesTable.id }).from(matchesTable).where(eq(matchesTable.hostId, host.id))).map(m => m.id);
  if (hostedMatchIds.length === 0) { res.json({ hasPlayed: false }); return; }
  const participated = await db.select().from(matchParticipantsTable)
    .where(and(eq(matchParticipantsTable.userId, currentUser.id), inArray(matchParticipantsTable.matchId, hostedMatchIds)))
    .limit(1);
  res.json({ hasPlayed: participated.length > 0 });
});

router.get("/users/me/esports-stats", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const stats = await db.select().from(esportsStatsTable).where(eq(esportsStatsTable.userId, user.id));
  res.json(stats.map(s => ({ game: s.game, stats: s.stats })));
});

router.put("/users/me/esports-stats", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { game, stats } = req.body;
  if (!game) return res.status(400).json({ error: "Game is required" });
  const [existing] = await db.select().from(esportsStatsTable).where(
    and(eq(esportsStatsTable.userId, user.id), eq(esportsStatsTable.game, game))
  );
  if (existing) {
    await db.update(esportsStatsTable).set({ stats, updatedAt: new Date() })
      .where(and(eq(esportsStatsTable.userId, user.id), eq(esportsStatsTable.game, game)));
  } else {
    await db.insert(esportsStatsTable).values({ userId: user.id, game, stats });
  }
  res.json({ success: true });
});

router.put("/users/me/profile", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { name, handle, avatar, instagram, discord, x, youtube, twitch, game, gameUid, isEsportsPlayer, bio, profileAnimation, profileColor } = req.body;
  const updateData: any = {};
  if (name) updateData.name = name;
  if (handle) updateData.handle = handle;
  if (avatar) updateData.avatar = avatar;
  updateData.instagram = instagram ?? null;
  updateData.discord = discord ?? null;
  updateData.x = x ?? null;
  updateData.bio = bio ?? null;
  if (profileAnimation !== undefined) updateData.profileAnimation = profileAnimation || null;
  if (profileColor !== undefined) updateData.profileColor = profileColor || null;
  if (user.role === "host" || user.role === "admin") {
    updateData.youtube = youtube ?? null;
    updateData.twitch = twitch ?? null;
  }
  if (user.role === "player") {
    if (game) updateData.game = game;
    if (gameUid !== undefined) updateData.gameUid = gameUid || null;
    if (isEsportsPlayer !== undefined) updateData.isEsportsPlayer = Boolean(isEsportsPlayer);
  }
  const [updated] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, user.id)).returning();
  try { getIO().to(`user-${user.id}`).emit("user:updated"); } catch {}
  res.json({
    id: updated.id, email: updated.email, name: updated.name, handle: updated.handle,
    avatar: updated.avatar, game: updated.game, gameUid: updated.gameUid, role: updated.role,
    balance: parseFloat(updated.balance as string), status: updated.status, profileSetup: updated.profileSetup,
    followersCount: updated.followersCount, followingCount: updated.followingCount,
    instagram: updated.instagram, discord: updated.discord, x: updated.x,
    youtube: updated.youtube, twitch: updated.twitch,
    isEsportsPlayer: updated.isEsportsPlayer ?? false,
    bio: updated.bio ?? null,
    profileAnimation: updated.profileAnimation ?? null,
    profileColor: updated.profileColor ?? null,
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

  const msgIds = msgs.map(m => m.id);
  const reactions = msgIds.length > 0
    ? await db.select().from(messageReactionsTable).where(inArray(messageReactionsTable.messageId, msgIds))
    : [];

  const reactionsByMsg = new Map<number, Record<string, number[]>>();
  for (const r of reactions) {
    if (!reactionsByMsg.has(r.messageId)) reactionsByMsg.set(r.messageId, {});
    const map = reactionsByMsg.get(r.messageId)!;
    if (!map[r.emoji]) map[r.emoji] = [];
    map[r.emoji].push(r.userId);
  }

  res.json(msgs.map(m => ({
    id: m.id,
    fromUserId: m.fromUserId,
    toUserId: m.toUserId,
    content: m.content,
    createdAt: m.createdAt?.toISOString(),
    read: m.read,
    reactions: reactionsByMsg.get(m.id) ?? {},
  })));
});

router.post("/messages/:id/react", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const messageId = Number(req.params.id);
  const { emoji } = req.body;
  if (!emoji) { res.status(400).json({ error: "Emoji required" }); return; }

  const existing = await db.select().from(messageReactionsTable).where(
    and(
      eq(messageReactionsTable.messageId, messageId),
      eq(messageReactionsTable.userId, user.id),
      eq(messageReactionsTable.emoji, emoji)
    )
  );

  if (existing.length > 0) {
    await db.delete(messageReactionsTable).where(
      and(
        eq(messageReactionsTable.messageId, messageId),
        eq(messageReactionsTable.userId, user.id),
        eq(messageReactionsTable.emoji, emoji)
      )
    );
    res.json({ action: "removed" });
  } else {
    await db.insert(messageReactionsTable).values({ messageId, userId: user.id, emoji });
    res.json({ action: "added" });
  }
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
  const [saved] = await db.insert(messagesTable).values({ fromUserId: user.id, toUserId: target.id, content: content.trim() }).returning();
  try {
    const { getIO } = await import("../lib/socket");
    const payload = {
      id: saved.id,
      fromUserId: user.id,
      toUserId: target.id,
      content: saved.content,
      createdAt: saved.createdAt,
      read: false,
      reactions: {},
    };
    getIO().to(`user-${target.id}`).emit("dm:message", payload);
    getIO().to(`user-${user.id}`).emit("dm:message", payload);
  } catch {}
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

  let playedMatchIds: number[] = [];
  if (user.role === "player") {
    const participations = await db.select({ matchId: matchParticipantsTable.matchId }).from(matchParticipantsTable).where(eq(matchParticipantsTable.userId, user.id));
    playedMatchIds = participations.map(p => p.matchId);
  }

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
    matchesCount: user.role === "player" ? playedMatchIds.length : hostedMatches.length,
    isFollowing: !!follow,
    instagram: user.instagram,
    discord: user.discord,
    x: user.x,
    youtube: user.youtube,
    twitch: user.twitch,
    bio: user.bio ?? null,
    isEsportsPlayer: user.isEsportsPlayer ?? false,
    profileAnimation: user.profileAnimation ?? null,
    profileColor: user.profileColor ?? null,
    equippedFrame: user.equippedFrame ?? null,
    equippedBadge: user.equippedBadge ?? null,
    equippedHandleColor: user.equippedHandleColor ?? null,
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

router.get("/users/:handle/reviews", requireAuth, async (req: Request, res: Response) => {
  const { handle } = req.params;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.handle, handle));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const reviews = await db.select({
    id: hostReviewsTable.id, rating: hostReviewsTable.rating, comment: hostReviewsTable.comment,
    createdAt: hostReviewsTable.createdAt, reviewerId: hostReviewsTable.reviewerId,
    reviewerName: usersTable.name, reviewerHandle: usersTable.handle, reviewerAvatar: usersTable.avatar,
  }).from(hostReviewsTable)
    .leftJoin(usersTable, eq(hostReviewsTable.reviewerId, usersTable.id))
    .where(eq(hostReviewsTable.hostId, user.id))
    .orderBy(desc(hostReviewsTable.createdAt))
    .limit(50);
  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;
  res.json({ reviews: reviews.map(r => ({ id: r.id, rating: r.rating, comment: r.comment, createdAt: r.createdAt?.toISOString(), reviewerName: r.reviewerName, reviewerHandle: r.reviewerHandle, reviewerAvatar: r.reviewerAvatar })), avgRating, count: reviews.length });
});

router.post("/users/:handle/reviews", requireAuth, async (req: Request, res: Response) => {
  const currentUser = (req as any).user;
  const { handle } = req.params;
  const { rating, comment, matchId } = req.body;
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: "Rating must be 1-5" });
  const [host] = await db.select().from(usersTable).where(eq(usersTable.handle, handle));
  if (!host) return res.status(404).json({ error: "Host not found" });
  if (host.id === currentUser.id) return res.status(400).json({ error: "Cannot review yourself" });
  const existing = await db.select().from(hostReviewsTable).where(
    and(eq(hostReviewsTable.reviewerId, currentUser.id), eq(hostReviewsTable.hostId, host.id),
      matchId ? eq(hostReviewsTable.matchId, matchId) : sql`true`)
  );
  if (existing.length > 0) return res.status(400).json({ error: "Already reviewed this host for this match" });
  await db.insert(hostReviewsTable).values({ matchId: matchId ?? 0, reviewerId: currentUser.id, hostId: host.id, rating, comment: comment || null });
  res.json({ success: true });
});

router.get("/users/:handle/squad", requireAuth, async (req: Request, res: Response) => {
  const { handle } = req.params;
  const isId = /^\d+$/.test(handle);
  const [user] = isId
    ? await db.select().from(usersTable).where(eq(usersTable.id, parseInt(handle)))
    : await db.select().from(usersTable).where(eq(usersTable.handle, handle));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const squad = await db.select().from(squadMembersTable).where(eq(squadMembersTable.userId, user.id));
  const linkedIds = squad.map(s => s.linkedUserId).filter(Boolean) as number[];
  const linkedUsers = linkedIds.length > 0
    ? await db.select({ id: usersTable.id, avatar: usersTable.avatar, handle: usersTable.handle, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, linkedIds))
    : [];
  const linkedMap = new Map(linkedUsers.map(u => [u.id, u]));
  res.json(squad.map(s => {
    const lu = s.linkedUserId ? linkedMap.get(s.linkedUserId) : null;
    return { id: s.id, name: s.name, uid: s.uid, game: s.game ?? null, role: s.role ?? null, isBackup: s.isBackup, linkedUserId: s.linkedUserId ?? null, linkedAvatar: lu?.avatar ?? null, linkedHandle: lu?.handle ?? null, linkedName: lu?.name ?? null };
  }));
});

router.get("/users/:handle/esports-stats", requireAuth, async (req: Request, res: Response) => {
  const { handle } = req.params;
  const isId = /^\d+$/.test(handle);
  const [user] = isId
    ? await db.select().from(usersTable).where(eq(usersTable.id, parseInt(handle)))
    : await db.select().from(usersTable).where(eq(usersTable.handle, handle));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const stats = await db.select().from(esportsStatsTable).where(eq(esportsStatsTable.userId, user.id));
  res.json(stats.map(s => ({ game: s.game, stats: s.stats })));
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
