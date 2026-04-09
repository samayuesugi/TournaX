import { pgTable, text, serial, integer, timestamp, boolean, json, unique } from "drizzle-orm/pg-core";

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id").notNull(),
  toUserId: integer("to_user_id").notNull(),
  content: text("content").notNull(),
  read: boolean("read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const messageReactionsTable = pgTable("message_reactions", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull(),
  userId: integer("user_id").notNull(),
  emoji: text("emoji").notNull(),
}, (t) => [unique().on(t.messageId, t.userId, t.emoji)]);

export const messageRequestsTable = pgTable("message_requests", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id").notNull(),
  toUserId: integer("to_user_id").notNull(),
  status: text("status").default("pending").notNull(),
  firstMessage: text("first_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(),
  message: text("message").notNull(),
  read: boolean("read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  endpoint: text("endpoint").notNull().unique(),
  subscription: json("subscription").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
