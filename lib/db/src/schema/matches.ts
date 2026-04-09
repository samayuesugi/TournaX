import { pgTable, text, serial, integer, boolean, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const matchStatusEnum = pgEnum("match_status", ["upcoming", "live", "completed"]);

export const matchesTable = pgTable("matches", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  game: text("game").notNull(),
  mode: text("mode").notNull(),
  teamSize: integer("team_size").notNull().default(1),
  entryFee: numeric("entry_fee", { precision: 10, scale: 2 }).notNull(),
  showcasePrizePool: numeric("showcase_prize_pool", { precision: 10, scale: 2 }).notNull().default("0"),
  startTime: timestamp("start_time").notNull(),
  status: matchStatusEnum("status").notNull().default("upcoming"),
  slots: integer("slots").notNull(),
  filledSlots: integer("filled_slots").notNull().default(0),
  hostId: integer("host_id").notNull(),
  roomId: text("room_id"),
  roomPassword: text("room_password"),
  roomReleased: boolean("room_released").notNull().default(false),
  description: text("description"),
  thumbnailImage: text("thumbnail_image"),
  hostContribution: numeric("host_contribution", { precision: 10, scale: 2 }).notNull().default("0"),
  category: text("category"),
  map: text("map"),
  resultScreenshotUrl: text("result_screenshot_url"),
  resultScreenshotUrls: text("result_screenshot_urls"),
  screenshotUploadedAt: timestamp("screenshot_uploaded_at"),
  resultSkipReason: text("result_skip_reason"),
  rewardDistribution: text("reward_distribution"),
  isEsportsOnly: boolean("is_esports_only").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const matchParticipantsTable = pgTable("match_participants", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull(),
  userId: integer("user_id").notNull(),
  teamName: text("team_name"),
  teamNumber: integer("team_number").notNull(),
  rank: integer("rank"),
  reward: numeric("reward", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const matchPlayersTable = pgTable("match_players", {
  id: serial("id").primaryKey(),
  participantId: integer("participant_id").notNull(),
  matchId: integer("match_id").notNull(),
  ign: text("ign").notNull(),
  uid: text("uid").notNull(),
  position: integer("position").notNull().default(1),
});

export const tournamentBracketsTable = pgTable("tournament_brackets", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull().unique(),
  bracketData: text("bracket_data").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertMatchSchema = createInsertSchema(matchesTable).omit({ id: true, createdAt: true, code: true, filledSlots: true });
export type InsertMatch = z.infer<typeof insertMatchSchema>;
export type Match = typeof matchesTable.$inferSelect;
