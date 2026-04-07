import bcrypt from "bcryptjs";
import { db } from "./index";
import { usersTable, gamesTable, gameModesTable } from "./schema";
import { eq } from "drizzle-orm";

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

const DEFAULT_ACCOUNTS = [
  {
    email: "samayuesugi@gmail.com",
    password: process.env.DEFAULT_ADMIN_PASSWORD || "SmityXmr@0816",
    name: "Admin",
    handle: "admin",
    avatar: "👑",
    role: "admin" as const,
  },
  {
    email: "player@test.com",
    password: "Player@123",
    name: "Test Player",
    handle: "testplayer",
    avatar: "🎮",
    role: "player" as const,
    game: "BGMI",
  },
  {
    email: "host@test.com",
    password: "Host@123",
    name: "Test Host",
    handle: "testhost",
    avatar: "🏆",
    role: "host" as const,
    game: "BGMI",
  },
];

const DEFAULT_GAMES = [
  { name: "BGMI", modes: [{ name: "Solo", teamSize: 1 }, { name: "Duo", teamSize: 2 }, { name: "Squad", teamSize: 4 }] },
  { name: "Free Fire", modes: [{ name: "Solo", teamSize: 1 }, { name: "Duo", teamSize: 2 }, { name: "Squad", teamSize: 4 }] },
  { name: "COD Mobile", modes: [{ name: "Solo", teamSize: 1 }, { name: "Duo", teamSize: 2 }, { name: "Squad", teamSize: 4 }] },
  { name: "Valorant", modes: [{ name: "Solo", teamSize: 1 }, { name: "Team", teamSize: 5 }] },
  { name: "PUBG PC", modes: [{ name: "Solo", teamSize: 1 }, { name: "Duo", teamSize: 2 }, { name: "Squad", teamSize: 4 }] },
];

export async function seedDefaults() {
  for (const game of DEFAULT_GAMES) {
    const existing = await db.select({ id: gamesTable.id }).from(gamesTable).where(eq(gamesTable.name, game.name));
    if (existing.length === 0) {
      const [inserted] = await db.insert(gamesTable).values({ name: game.name }).returning();
      for (const mode of game.modes) {
        await db.insert(gameModesTable).values({ gameId: inserted.id, name: mode.name, teamSize: mode.teamSize });
      }
      console.log(`[seed] Created game: ${game.name}`);
    }
  }

  for (const account of DEFAULT_ACCOUNTS) {
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, account.email));

    if (!existing) {
      const referralCode = `Tx-${account.handle}${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;
      await db.insert(usersTable).values({
        email: account.email,
        password: await hashPassword(account.password),
        name: account.name,
        handle: account.handle,
        avatar: account.avatar,
        role: account.role,
        game: (account as any).game ?? null,
        status: "active",
        profileSetup: true,
        balance: "0",
        followersCount: 0,
        followingCount: 0,
        recommended: false,
        referralCode,
      });
      console.log(`[seed] Created default ${account.role} account`);
    }
  }
}
