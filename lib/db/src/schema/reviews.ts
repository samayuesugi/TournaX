import { pgTable, serial, integer, text, timestamp, boolean, unique } from "drizzle-orm/pg-core";

export const hostReviewsTable = pgTable("host_reviews", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull(),
  reviewerId: integer("reviewer_id").notNull(),
  hostId: integer("host_id").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const hostRatingsTable = pgTable("host_ratings", {
  id: serial("id").primaryKey(),
  hostId: integer("host_id").notNull(),
  matchId: integer("match_id").notNull(),
  raterId: integer("rater_id").notNull(),
  prizeOnTime: boolean("prize_on_time").notNull(),
  roomCodeOnTime: boolean("room_code_on_time").notNull(),
  overallRating: integer("overall_rating").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  oneRatingPerPlayerMatch: unique("host_ratings_host_match_rater_unique").on(table.hostId, table.matchId, table.raterId),
}));
