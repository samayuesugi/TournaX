import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const userCosmeticsTable = pgTable("user_cosmetics", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  itemId: text("item_id").notNull(),
  category: text("category").notNull(),
  purchasedAt: timestamp("purchased_at").defaultNow(),
});
