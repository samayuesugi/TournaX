import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { usersTable, groupsTable, groupMembersTable, groupMessagesTable } from "@workspace/db/schema";
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
  const { name, avatar } = req.body;
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
    }).returning();
    await db.insert(groupMembersTable).values({ groupId: group.id, userId: user.id });
    res.json(group);
  } else if (user.role === "player") {
    const [group] = await db.insert(groupsTable).values({
      name: name.trim(),
      avatar: avatar || "⚔️",
      type: "player",
      createdBy: user.id,
      maxMembers: 10,
      messageRetentionDays: PLAYER_RETENTION_DEFAULT,
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

  const isMember = await db.select().from(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, user.id)));
  if (!isMember.length) { res.status(403).json({ error: "You are not a member of this group" }); return; }

  const memberships = await db.select().from(groupMembersTable).where(eq(groupMembersTable.groupId, groupId));
  const members = await Promise.all(memberships.map(async (m) => {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, m.userId));
    return u ? { id: u.id, name: u.name, handle: u.handle, avatar: u.avatar, role: u.role } : null;
  }));

  res.json({
    id: group.id,
    name: group.name,
    avatar: group.avatar,
    type: group.type,
    createdBy: group.createdBy,
    maxMembers: group.maxMembers,
    messageRetentionDays: group.messageRetentionDays,
    members: members.filter(Boolean),
  });
});

router.put("/groups/:id/settings", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const groupId = Number(req.params.id);
  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, groupId));
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  if (group.createdBy !== user.id) { res.status(403).json({ error: "Only the group creator can change settings" }); return; }

  const { messageRetentionDays } = req.body;
  if (messageRetentionDays == null) { res.status(400).json({ error: "messageRetentionDays required" }); return; }

  const days = Number(messageRetentionDays);
  const isHost = group.type === "host";
  const maxDays = isHost ? HOST_RETENTION_MAX : PLAYER_RETENTION_MAX;
  const minDays = 1;

  if (!Number.isInteger(days) || days < minDays || days > maxDays) {
    res.status(400).json({ error: `Retention must be between ${minDays} and ${maxDays} days` });
    return;
  }

  await db.update(groupsTable).set({ messageRetentionDays: days }).where(eq(groupsTable.id, groupId));
  res.json({ success: true, messageRetentionDays: days });
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

  await db.insert(groupMessagesTable).values({ groupId, fromUserId: user.id, content: content.trim() });
  res.json({ success: true });
});

router.get("/groups/by-host/:hostId", async (req: Request, res: Response) => {
  const hostId = Number(req.params.hostId);
  const [group] = await db.select().from(groupsTable)
    .where(and(eq(groupsTable.createdBy, hostId), eq(groupsTable.type, "host")));
  if (!group) { res.json(null); return; }
  const members = await db.select().from(groupMembersTable).where(eq(groupMembersTable.groupId, group.id));
  res.json({ id: group.id, name: group.name, avatar: group.avatar, memberCount: members.length });
});

export default router;
