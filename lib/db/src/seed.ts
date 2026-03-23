import crypto from "crypto";
import { db } from "./index";
import { usersTable, gamesTable, gameModesTable } from "./schema";
import { eq } from "drizzle-orm";

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "tournax_salt").digest("hex");
}

const DEFAULT_ACCOUNTS = [
  {
    email: "admin@tournax.com",
    password: "admin@123",
    name: "Admin",
    handle: "admin",
    avatar: "/admin-avatar.jpeg",
    role: "admin" as const,
  },
  {
    email: "host@tournax.com",
    password: "host@123",
    name: "Sample Host",
    handle: "samplehost",
    avatar: "🎮",
    role: "host" as const,
    recommended: true,
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
      await db.insert(usersTable).values({
        email: account.email,
        password: hashPassword(account.password),
        name: account.name,
        handle: account.handle,
        avatar: account.avatar,
        role: account.role,
        status: "active",
        profileSetup: true,
        balance: "0",
        followersCount: 0,
        followingCount: 0,
        recommended: (account as any).recommended ?? false,
      });
      console.log(`[seed] Created default ${account.role}: ${account.email}`);
    } else if ((account as any).recommended) {
      await db.update(usersTable).set({ recommended: true }).where(eq(usersTable.id, existing.id));
    }
  }
}
