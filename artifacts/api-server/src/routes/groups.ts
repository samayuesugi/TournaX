import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { usersTable, groupsTable, groupMembersTable, groupMessagesTable, groupJoinRequestsTable } from "@workspace/db/schema";
import { eq, and, gte } from "drizzle-orm";
import { requireAuth } from "./auth";

const router: IRouter = Router();

const PLAYER_RETENTION_DEFAULT = 3;
const PLAYER_RETENTION_MAX = 7;
const HOST_RETENTION_DEFAULT = 1;
const HOST_RETENTION_MAX = 2;

function retentionCutoff(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

router.post("/groups", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { name, avatar, isPublic } = req.body;
  if (!name?.trim()) { res.status(400).json({ error: "Group name required" }); return; }

  if (user.role === "host") {
    const existing = await db.select().from(groupsTable)
      .where(and(eq(groupsTable.createdBy, user.id), eq(groupsTable.type, "host")));
    if (existing.length > 0) {
      res.status(400).json({ error: "You already have a group. Hosts can only create one group." });
      return;
    }
    const [group] = await db.insert(groupsTable).values({
      name: name.trim(),
      avatar: avatar || "🎮",
      type: "host",
      createdBy: user.id,
      maxMembers: null,
      messageRetentionDays: HOST_RETENTION_DEFAULT,
      isPublic: !!isPublic,
    }).returning();
    await db.insert(groupMembersTable).values({ groupId: group.id, userId: user.id });
    res.json(group);
  } else if (user.role === "player") {
    const existingPlayerGroups = await db.select().from(groupsTable)
      .where(and(eq(groupsTable.createdBy, user.id), eq(groupsTable.type, "player")));
    if (existingPlayerGroups.length >= 5) {
      res.status(400).json({ error: "You have reached the maximum limit of 5 groups." });
      return;
    }
    const [group] = await db.insert(groupsTable).values({
      name: name.trim(),
      avatar: avatar || "⚔️",
      type: "player",
      createdBy: user.id,
      maxMembers: 10,
      messageRetentionDays: PLAYER_RETENTION_DEFAULT,
      isPublic: !!isPublic,
    }).returning();
    await db.insert(groupMembersTable).values({ groupId: group.id, userId: user.id });
    res.json(group);
  } else {
    res.status(403).json({ error: "Only players and hosts can create groups" });
  }
});

router.get("/groups", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const memberships = await db.select().from(groupMembersTable).where(eq(groupMembersTable.userId, user.id));
  const groups = await Promise.all(memberships.map(async (m) => {
    const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, m.groupId));
    if (!group) return null;
    const members = await db.select().from(groupMembersTable).where(eq(groupMembersTable.groupId, group.id));
    const cutoff = retentionCutoff(group.messageRetentionDays);
    const allMsgs = await db.select().from(groupMessagesTable)
      .where(and(eq(groupMessagesTable.groupId, group.id), gte(groupMessagesTable.createdAt, cutoff)));
    allMsgs.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
    return {
      id: group.id,
      name: group.name,
      avatar: group.avatar,
      type: group.type,
      createdBy: group.createdBy,
      maxMembers: group.maxMembers,
      messageRetentionDays: group.messageRetentionDays,
      isPublic: group.isPublic,
      memberCount: members.length,
      lastMessage: allMsgs[0]?.content || "",
      lastMessageAt: allMsgs[0]?.createdAt?.toISOString() || group.createdAt?.toISOString() || "",
    };
  }));
  res.json(groups.filter(Boolean));
});

router.get("/groups/:id", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const groupId = Number(req.params.id);
  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, groupId));
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }

  const memberRows = await db.select().from(groupMembersTable).where(eq(groupMembersTable.groupId, groupId));
  const isMember = memberRows.some(m => m.userId === user.id);

  if (!isMember) {
    // Find the user's join request status (if any)
    const [joinRequest] = await db.select().from(groupJoinRequestsTable)
      .where(and(eq(groupJoinRequestsTable.groupId, groupId), eq(groupJoinRequestsTable.userId, user.id)));

    // Return basic info for public OR private groups — both are visible
    // (private groups show on profile but require a join request)
    if (!group.isPublic && !joinRequest) {
      // Private group with no existing request — show basic info only
      return res.json({
        id: group.id,
        name: group.name,
        avatar: group.avatar,
        type: group.type,
        createdBy: group.createdBy,
        maxMembers: group.maxMembers,
        messageRetentionDays: group.messageRetentionDays,
        isPublic: group.isPublic,
        isMember: false,
        memberCount: memberRows.length,
        members: [],
        requestStatus: null,
      });
    }

    return res.json({
      id: group.id,
      name: group.name,
      avatar: group.avatar,
      type: group.type,
      createdBy: group.createdBy,
      maxMembers: group.maxMembers,
      messageRetentionDays: group.messageRetentionDays,
      isPublic: group.isPublic,
      isMember: false,
      memberCount: memberRows.length,
      members: [],
      requestStatus: joinRequest?.status ?? null,
    });
  }

  const members = await Promise.all(memberRows.map(async (m) => {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, m.userId));
    return u ? { id: u.id, name: u.name, handle: u.handle, avatar: u.avatar, role: u.role } : null;
  }));

  // Pending join requests count (for host)
  const pendingRequests = await db.select().from(groupJoinRequestsTable)
    .where(and(eq(groupJoinRequestsTable.groupId, groupId), eq(groupJoinRequestsTable.status, "pending")));

  res.json({
    id: group.id,
    name: group.name,
    avatar: group.avatar,
    type: group.type,
    createdBy: group.createdBy,
    maxMembers: group.maxMembers,
    messageRetentionDays: group.messageRetentionDays,
    isPublic: group.isPublic,
    isMember: true,
    memberCount: memberRows.length,
    members: members.filter(Boolean),
    pendingRequestCount: pendingRequests.length,
  });
});

router.post("/groups/:id/join", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const groupId = Number(req.params.id);
  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, groupId));
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }

  const memberRows = await db.select().from(groupMembersTable).where(eq(groupMembersTable.groupId, groupId));
  if (memberRows.some(m => m.userId === user.id)) {
    res.status(400).json({ error: "Already a member" }); return;
  }

  if (group.isPublic) {
    // Public group — join directly
    if (group.maxMembers && memberRows.length >= group.maxMembers) {
      res.status(400).json({ error: `Group is full (max ${group.maxMembers} members)` }); return;
    }
    await db.insert(groupMembersTable).values({ groupId, userId: user.id });
    res.json({ success: true, joined: true });
  } else {
    // Private group — create a join request
    const [existing] = await db.select().from(groupJoinRequestsTable)
      .where(and(eq(groupJoinRequestsTable.groupId, groupId), eq(groupJoinRequestsTable.userId, user.id)));

    if (existing) {
      if (existing.status === "pending") {
        res.status(400).json({ error: "You already have a pending request" }); return;
      }
      // Re-request if previously rejected
      await db.update(groupJoinRequestsTable)
        .set({ status: "pending" })
        .where(eq(groupJoinRequestsTable.id, existing.id));
    } else {
      await db.insert(groupJoinRequestsTable).values({ groupId, userId: user.id, status: "pending" });
    }
    res.json({ success: true, joined: false, requested: true });
  }
});

// Get pending join requests (host/creator only)
router.get("/groups/:id/requests", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const groupId = Number(req.params.id);
  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, groupId));
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  if (group.createdBy !== user.id) { res.status(403).json({ error: "Only the group creator can view requests" }); return; }

  const requests = await db.select().from(groupJoinRequestsTable)
    .where(and(eq(groupJoinRequestsTable.groupId, groupId), eq(groupJoinRequestsTable.status, "pending")));

  const withUsers = await Promise.all(requests.map(async (r) => {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, r.userId));
    return u ? { id: r.id, userId: r.userId, name: u.name, handle: u.handle, avatar: u.avatar, createdAt: r.createdAt?.toISOString() } : null;
  }));

  res.json(withUsers.filter(Boolean));
});

// Approve or reject a join request (host/creator only)
router.put("/groups/:id/requests/:requestId", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const groupId = Number(req.params.id);
  const requestId = Number(req.params.requestId);
  const { action } = req.body; // 'approve' | 'reject'

  if (!["approve", "reject"].includes(action)) {
    res.status(400).json({ error: "action must be 'approve' or 'reject'" }); return;
  }

  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, groupId));
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  if (group.createdBy !== user.id) { res.status(403).json({ error: "Only the group creator can manage requests" }); return; }

  const [request] = await db.select().from(groupJoinRequestsTable)
    .where(and(eq(groupJoinRequestsTable.id, requestId), eq(groupJoinRequestsTable.groupId, groupId)));
  if (!request) { res.status(404).json({ error: "Request not found" }); return; }

  if (action === "approve") {
    const memberRows = await db.select().from(groupMembersTable).where(eq(groupMembersTable.groupId, groupId));
    if (group.maxMembers && memberRows.length >= group.maxMembers) {
      res.status(400).json({ error: `Group is full (max ${group.maxMembers} members)` }); return;
    }
    // Check not already a member
    if (!memberRows.some(m => m.userId === request.userId)) {
      await db.insert(groupMembersTable).values({ groupId, userId: request.userId });
    }
    await db.update(groupJoinRequestsTable).set({ status: "approved" }).where(eq(groupJoinRequestsTable.id, requestId));
    res.json({ success: true, action: "approved" });
  } else {
    await db.update(groupJoinRequestsTable).set({ status: "rejected" }).where(eq(groupJoinRequestsTable.id, requestId));
    res.json({ success: true, action: "rejected" });
  }
});

router.put("/groups/:id/settings", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const groupId = Number(req.params.id);
  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, groupId));
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  if (group.createdBy !== user.id) { res.status(403).json({ error: "Only the group creator can change settings" }); return; }

  const { name, messageRetentionDays, isPublic, avatar } = req.body;
  const updates: Partial<{ name: string; messageRetentionDays: number; isPublic: boolean; avatar: string }> = {};

  if (name != null) {
    const trimmed = String(name).trim();
    if (!trimmed) { res.status(400).json({ error: "Group name cannot be empty" }); return; }
    if (trimmed.length > 50) { res.status(400).json({ error: "Group name too long (max 50 characters)" }); return; }
    updates.name = trimmed;
  }

  if (messageRetentionDays != null) {
    const days = Number(messageRetentionDays);
    const isHost = group.type === "host";
    const maxDays = isHost ? HOST_RETENTION_MAX : PLAYER_RETENTION_MAX;
    if (!Number.isInteger(days) || days < 1 || days > maxDays) {
      res.status(400).json({ error: `Retention must be between 1 and ${maxDays} days` }); return;
    }
    updates.messageRetentionDays = days;
  }

  if (isPublic != null) {
    updates.isPublic = !!isPublic;
  }

  if (avatar != null) {
    const trimmed = String(avatar).trim();
    if (!trimmed) { res.status(400).json({ error: "Avatar cannot be empty" }); return; }
    updates.avatar = trimmed;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid settings provided" }); return;
  }

  await db.update(groupsTable).set(updates).where(eq(groupsTable.id, groupId));
  res.json({ success: true, ...updates });
});

router.post("/groups/:id/members", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const groupId = Number(req.params.id);
  const { handle } = req.body;
  if (!handle) { res.status(400).json({ error: "handle required" }); return; }

  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, groupId));
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  if (group.createdBy !== user.id) { res.status(403).json({ error: "Only the group creator can add members" }); return; }

  const currentMembers = await db.select().from(groupMembersTable).where(eq(groupMembersTable.groupId, groupId));
  if (group.maxMembers && currentMembers.length >= group.maxMembers) {
    res.status(400).json({ error: `This group is full (max ${group.maxMembers} members)` }); return;
  }

  const [target] = await db.select().from(usersTable).where(eq(usersTable.handle, handle));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (target.role !== "player") { res.status(400).json({ error: "Only players can be added to groups" }); return; }

  const alreadyMember = currentMembers.find(m => m.userId === target.id);
  if (alreadyMember) { res.status(400).json({ error: "User is already a member" }); return; }

  await db.insert(groupMembersTable).values({ groupId, userId: target.id });
  res.json({ success: true });
});

router.delete("/groups/:id/members/:userId", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const groupId = Number(req.params.id);
  const targetUserId = Number(req.params.userId);

  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, groupId));
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  if (group.createdBy !== user.id && user.id !== targetUserId) {
    res.status(403).json({ error: "Not allowed" }); return;
  }
  if (targetUserId === group.createdBy) {
    res.status(400).json({ error: "Cannot remove the group creator" }); return;
  }

  await db.delete(groupMembersTable).where(
    and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, targetUserId))
  );
  res.json({ success: true });
});

router.get("/groups/:id/messages", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const groupId = Number(req.params.id);

  const isMember = await db.select().from(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, user.id)));
  if (!isMember.length) { res.status(403).json({ error: "Not a member" }); return; }

  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, groupId));
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }

  const cutoff = retentionCutoff(group.messageRetentionDays);
  const msgs = await db.select().from(groupMessagesTable)
    .where(and(eq(groupMessagesTable.groupId, groupId), gte(groupMessagesTable.createdAt, cutoff)));

  const withSenders = await Promise.all(msgs.map(async (m) => {
    const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, m.fromUserId));
    return {
      id: m.id,
      groupId: m.groupId,
      fromUserId: m.fromUserId,
      senderName: sender?.name || sender?.handle || "Unknown",
      senderHandle: sender?.handle || "",
      senderAvatar: sender?.avatar || "🔥",
      content: m.content,
      createdAt: m.createdAt?.toISOString(),
    };
  }));
  withSenders.sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());
  res.json(withSenders);
});

router.post("/groups/:id/messages", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const groupId = Number(req.params.id);
  const { content } = req.body;
  if (!content?.trim()) { res.status(400).json({ error: "content required" }); return; }

  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, groupId));
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }

  const isMember = await db.select().from(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, user.id)));
  if (!isMember.length) { res.status(403).json({ error: "Not a member" }); return; }

  if (group.type === "host" && user.id !== group.createdBy) {
    res.status(403).json({ error: "Only the host can send messages in this group" }); return;
  }

  const [saved] = await db.insert(groupMessagesTable).values({ groupId, fromUserId: user.id, content: content.trim() }).returning();
  try {
    const { getIO } = await import("../lib/socket");
    getIO().to(`group-${groupId}`).emit("group:message", {
      id: saved.id,
      groupId,
      fromUserId: user.id,
      senderName: user.name || user.handle || "",
      senderHandle: user.handle || "",
      senderAvatar: user.avatar || "🔥",
      content: saved.content,
      createdAt: saved.createdAt,
    });
  } catch {}
  res.json({ success: true });
});

router.get("/groups/discover", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { search } = req.query;

  const allGroups = await db.select().from(groupsTable)
    .where(eq(groupsTable.isPublic, true));

  const filtered = search
    ? allGroups.filter(g => g.name.toLowerCase().includes((search as string).toLowerCase()))
    : allGroups;

  const myMemberships = await db.select().from(groupMembersTable).where(eq(groupMembersTable.userId, user.id));
  const myGroupIds = new Set(myMemberships.map(m => m.groupId));

  const result = await Promise.all(filtered.map(async (group) => {
    const members = await db.select().from(groupMembersTable).where(eq(groupMembersTable.groupId, group.id));
    return {
      id: group.id,
      name: group.name,
      avatar: group.avatar,
      type: group.type,
      createdBy: group.createdBy,
      maxMembers: group.maxMembers,
      isPublic: group.isPublic,
      memberCount: members.length,
      isMember: myGroupIds.has(group.id),
    };
  }));

  res.json(result);
});

// Always return the host group (public or private) so it shows on the host's profile
router.get("/groups/by-host/:hostId", async (req: Request, res: Response) => {
  const hostId = Number(req.params.hostId);
  const [group] = await db.select().from(groupsTable)
    .where(and(eq(groupsTable.createdBy, hostId), eq(groupsTable.type, "host")));
  if (!group) { res.json(null); return; }
  const members = await db.select().from(groupMembersTable).where(eq(groupMembersTable.groupId, group.id));
  res.json({ id: group.id, name: group.name, avatar: group.avatar, memberCount: members.length, isPublic: group.isPublic });
});

export default router;
