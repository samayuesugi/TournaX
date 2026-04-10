import bcrypt from "bcryptjs";
import { db } from "./index";
import { usersTable, gamesTable, gameModesTable, userCosmeticsTable } from "./schema";
import { eq } from "drizzle-orm";

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

const ALL_STORE_ITEM_IDS = [
  { id: "frame-fire",    category: "frame" },
  { id: "frame-galaxy",  category: "frame" },
  { id: "frame-gold",    category: "frame" },
  { id: "frame-neon",    category: "frame" },
  { id: "frame-legend",  category: "frame" },
  { id: "badge-warrior",  category: "badge" },
  { id: "badge-ghost",    category: "badge" },
  { id: "badge-champion", category: "badge" },
  { id: "badge-dragon",   category: "badge" },
  { id: "badge-legend",   category: "badge" },
  { id: "color-purple", category: "handle_color" },
  { id: "color-red",    category: "handle_color" },
  { id: "color-green",  category: "handle_color" },
  { id: "color-cyan",   category: "handle_color" },
  { id: "color-gold",   category: "handle_color" },
];

const DEFAULT_ACCOUNTS = [
  {
    email: "samayuesugi@gmail.com",
    password: process.env.DEFAULT_ADMIN_PASSWORD || "SmityXmr@0816",
    name: "Admin",
    handle: "samay_uesugi",
    avatar: "👑",
    role: "admin" as const,
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
      const [inserted] = await db.insert(usersTable).values({
        email: account.email,
        password: await hashPassword(account.password),
        name: account.name,
        handle: account.handle,
        avatar: account.avatar,
        role: account.role,
        game: (account as any).game ?? null,
        isEsportsPlayer: (account as any).isEsportsPlayer ?? false,
        status: "active",
        profileSetup: true,
        balance: "0",
        followersCount: 0,
        followingCount: 0,
        recommended: false,
        referralCode,
      }).returning();
      console.log(`[seed] Created default ${account.role} account`);

      if ((account as any).allStoreUnlocked && inserted) {
        for (const item of ALL_STORE_ITEM_IDS) {
          await db.insert(userCosmeticsTable).values({
            userId: inserted.id,
            itemId: item.id,
            category: item.category,
          });
        }
        console.log(`[seed] Unlocked all store items for ${account.handle}`);
      }
    }
  }
}
