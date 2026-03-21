import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const gamesTable = pgTable("games", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const gameModesTable = pgTable("game_modes", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id").notNull(),
  name: text("name").notNull(),
  teamSize: integer("team_size").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
});
