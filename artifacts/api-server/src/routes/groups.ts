import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { usersTable, groupsTable, groupMembersTable, groupMessagesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "./auth";

const router: IRouter = Router();

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
    const lastMsgs = await db.select().from(groupMessagesTable).where(eq(groupMessagesTable.groupId, group.id));
    lastMsgs.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
    return {
      id: group.id,
      name: group.name,
      avatar: group.avatar,
      type: group.type,
      createdBy: group.createdBy,
      maxMembers: group.maxMembers,
      memberCount: members.length,
      lastMessage: lastMsgs[0]?.content || "",
      lastMessageAt: lastMsgs[0]?.createdAt?.toISOString() || group.createdAt?.toISOString() || "",
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
    members: members.filter(Boolean),
  });
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

  const msgs = await db.select().from(groupMessagesTable).where(eq(groupMessagesTable.groupId, groupId));
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
