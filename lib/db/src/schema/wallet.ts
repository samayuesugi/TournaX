import { pgTable, text, serial, integer, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const financeStatusEnum = pgEnum("finance_status", ["pending", "approved", "rejected"]);

export const addBalanceRequestsTable = pgTable("add_balance_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  utrNumber: text("utr_number").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  receiptUrl: text("receipt_url"),
  status: financeStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const withdrawalRequestsTable = pgTable("withdrawal_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  upiId: text("upi_id").notNull(),
  status: financeStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const hostEarningsTable = pgTable("host_earnings", {
  id: serial("id").primaryKey(),
  hostId: integer("host_id").notNull(),
  matchId: integer("match_id").notNull(),
  matchCode: text("match_code").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAddBalanceSchema = createInsertSchema(addBalanceRequestsTable).omit({ id: true, createdAt: true });
export type InsertAddBalance = z.infer<typeof insertAddBalanceSchema>;

export const insertWithdrawalSchema = createInsertSchema(withdrawalRequestsTable).omit({ id: true, createdAt: true });
export type InsertWithdrawal = z.infer<typeof insertWithdrawalSchema>;
