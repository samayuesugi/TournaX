import { pgTable, text, serial, integer, boolean, numeric, timestamp, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const roleEnum = pgEnum("role", ["player", "host", "admin"]);
export const statusEnum = pgEnum("user_status", ["pending", "active", "banned"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password"),
  googleId: text("google_id").unique(),
  name: text("name"),
  handle: text("handle").unique(),
  avatar: text("avatar").default("🔥"),
  game: text("game"),
  gameUid: text("game_uid"),
  role: roleEnum("role").notNull().default("player"),
  balance: numeric("balance", { precision: 10, scale: 2 }).notNull().default("0"),
  silverCoins: integer("silver_coins").notNull().default(0),
  lastLoginDate: text("last_login_date"),
  paidMatchesPlayed: integer("paid_matches_played").notNull().default(0),
  status: statusEnum("status").notNull().default("pending"),
  profileSetup: boolean("profile_setup").notNull().default(false),
  recommended: boolean("recommended").notNull().default(false),
  followersCount: integer("followers_count").notNull().default(0),
  followingCount: integer("following_count").notNull().default(0),
  instagram: text("instagram"),
  discord: text("discord"),
  x: text("x"),
  youtube: text("youtube"),
  twitch: text("twitch"),
  referralCode: text("referral_code").unique(),
  referralBonusUntil: text("referral_bonus_until"),
  dailyTaskDate: text("daily_task_date"),
  dailyWins: integer("daily_wins").notNull().default(0),
  dailyPaidMatches: integer("daily_paid_matches").notNull().default(0),
  tournamentWins: integer("tournament_wins").notNull().default(0),
  dailyTournamentWins: integer("daily_tournament_wins").notNull().default(0),
  dailyInviteShared: integer("daily_invite_shared").notNull().default(0),
  equippedFrame: text("equipped_frame"),
  equippedBadge: text("equipped_badge"),
  equippedHandleColor: text("equipped_handle_color"),
  isEsportsPlayer: boolean("is_esports_player").notNull().default(false),
  bio: text("bio"),
  ingameRole: text("ingame_role"),
  profileAnimation: text("profile_animation"),
  profileColor: text("profile_color"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const referralsTable = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerId: integer("referrer_id").notNull(),
  referredId: integer("referred_id").notNull().unique(),
  completed: boolean("completed").notNull().default(false),
  referrerRewarded: boolean("referrer_rewarded").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const followsTable = pgTable("follows", {
  id: serial("id").primaryKey(),
  followerId: integer("follower_id").notNull(),
  followingId: integer("following_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const squadMembersTable = pgTable("squad_members", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  uid: text("uid").notNull(),
  game: text("game"),
  linkedUserId: integer("linked_user_id"),
  role: text("role"),
  isBackup: boolean("is_backup").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const esportsStatsTable = pgTable("esports_stats", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  game: text("game").notNull(),
  stats: jsonb("stats").notNull().default({}),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const squadRequestsTable = pgTable("squad_requests", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id").notNull(),
  toUserId: integer("to_user_id").notNull(),
  game: text("game").notNull(),
  role: text("role"),
  isBackup: boolean("is_backup").notNull().default(false),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const complaintsTable = pgTable("complaints", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  hostHandle: text("host_handle"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
