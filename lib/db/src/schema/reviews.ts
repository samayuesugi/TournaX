import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const hostReviewsTable = pgTable("host_reviews", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull(),
  reviewerId: integer("reviewer_id").notNull(),
  hostId: integer("host_id").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow(),
});
