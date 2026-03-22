import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const groupsTable = pgTable("groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  avatar: text("avatar").default("👥"),
  type: text("type").notNull(),
  createdBy: integer("created_by").notNull(),
  maxMembers: integer("max_members"),
  messageRetentionDays: integer("message_retention_days").notNull().default(3),
  createdAt: timestamp("created_at").defaultNow(),
});

export const groupMembersTable = pgTable("group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  userId: integer("user_id").notNull(),
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const groupMessagesTable = pgTable("group_messages", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  fromUserId: integer("from_user_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
