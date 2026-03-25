import { pgTable, text, serial, integer, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const auctionStatusEnum = pgEnum("auction_status", ["upcoming", "live", "completed", "cancelled"]);

export const auctionsTable = pgTable("auctions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  tournamentName: text("tournament_name").notNull(),
  status: auctionStatusEnum("status").notNull().default("upcoming"),
  hostId: integer("host_id").notNull(),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const auctionTeamsTable = pgTable("auction_teams", {
  id: serial("id").primaryKey(),
  auctionId: integer("auction_id").notNull(),
  name: text("name").notNull(),
  logo: text("logo"),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const auctionPlayersTable = pgTable("auction_players", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull(),
  auctionId: integer("auction_id").notNull(),
  name: text("name").notNull(),
  avatar: text("avatar"),
  position: integer("position").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

export const auctionBidsTable = pgTable("auction_bids", {
  id: serial("id").primaryKey(),
  auctionId: integer("auction_id").notNull(),
  teamId: integer("team_id").notNull(),
  userId: integer("user_id").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const auctionResultsTable = pgTable("auction_results", {
  id: serial("id").primaryKey(),
  auctionId: integer("auction_id").notNull().unique(),
  firstTeamId: integer("first_team_id").notNull(),
  secondTeamId: integer("second_team_id").notNull(),
  thirdTeamId: integer("third_team_id").notNull(),
  totalPool: numeric("total_pool", { precision: 10, scale: 2 }).notNull(),
  platformFee: numeric("platform_fee", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
