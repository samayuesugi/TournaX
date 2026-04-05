import bcrypt from "bcryptjs";
import { db } from "./index";
import { usersTable, gamesTable, gameModesTable, matchesTable, hostReviewsTable } from "./schema";
import { eq, and } from "drizzle-orm";

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

const DEFAULT_ACCOUNTS = [
  {
    email: "samayuesugi@gmail.com",
    password: process.env.DEFAULT_ADMIN_PASSWORD || "SmityXmr@0816",
    name: "Admin",
    handle: "admin",
    avatar: "/admin-avatar.jpeg",
    role: "admin" as const,
  },
  {
    email: "testhost@tournax.com",
    password: "TestHost@123",
    name: "Test Host",
    handle: "testhost",
    avatar: "",
    role: "host" as const,
  },
  {
    email: "testplayer@tournax.com",
    password: "TestPlayer@123",
    name: "Test Player",
    handle: "testplayer",
    avatar: "",
    role: "player" as const,
  },
];

const DEFAULT_GAMES = [
  { name: "BGMI", modes: [{ name: "Solo", teamSize: 1 }, { name: "Duo", teamSize: 2 }, { name: "Squad", teamSize: 4 }] },
  { name: "Free Fire", modes: [{ name: "Solo", teamSize: 1 }, { name: "Duo", teamSize: 2 }, { name: "Squad", teamSize: 4 }] },
  { name: "COD Mobile", modes: [{ name: "Solo", teamSize: 1 }, { name: "Duo", teamSize: 2 }, { name: "Squad", teamSize: 4 }] },
  { name: "Valorant", modes: [{ name: "Solo", teamSize: 1 }, { name: "Team", teamSize: 5 }] },
  { name: "PUBG PC", modes: [{ name: "Solo", teamSize: 1 }, { name: "Duo", teamSize: 2 }, { name: "Squad", teamSize: 4 }] },
];

const DUMMY_HOSTS = [
  { email: "prokd@tournax.com",      password: "DummyHost@123", name: "ProGamer KD",    handle: "prokd",     avatar: "🎮", followersCount: 128 },
  { email: "squadrx@tournax.com",    password: "DummyHost@123", name: "SquadLeader RX", handle: "squadrx",   avatar: "⚔️", followersCount: 76  },
  { email: "battlesk@tournax.com",   password: "DummyHost@123", name: "BattleKing SK",  handle: "battlesk",  avatar: "🛡️", followersCount: 245 },
  { email: "tourneyvn@tournax.com",  password: "DummyHost@123", name: "TourneyBoss VN", handle: "tourneyvn", avatar: "🏆", followersCount: 312 },
];

const DUMMY_PLAYERS = [
  { email: "seedplayer1@tournax.com", password: "DummyPlayer@123", name: "Alpha Sniper",  handle: "alphasniper1" },
  { email: "seedplayer2@tournax.com", password: "DummyPlayer@123", name: "Beta Rush",     handle: "betarush2"    },
  { email: "seedplayer3@tournax.com", password: "DummyPlayer@123", name: "Gamma Clutch",  handle: "gammaclutch3" },
];

const DUMMY_MATCHES: Array<{
  hostEmail: string;
  matches: Array<{ code: string; game: string; mode: string; ratings: number[]; comments: string[] }>;
}> = [
  {
    hostEmail: "prokd@tournax.com",
    matches: [
      { code: "SEED-PROKD-01", game: "BGMI",      mode: "Squad", ratings: [5, 4, 5], comments: ["Amazing host! Very smooth tournament.", "Great experience, will join again.", "Top notch hosting skills!"] },
      { code: "SEED-PROKD-02", game: "Free Fire",  mode: "Duo",   ratings: [4, 5],    comments: ["Good host, on-time results.", "Best tournament host I have played with."] },
    ],
  },
  {
    hostEmail: "squadrx@tournax.com",
    matches: [
      { code: "SEED-SQDRX-01", game: "COD Mobile", mode: "Squad", ratings: [3, 4, 4], comments: ["Decent host, a bit slow with results.", "Pretty good overall.", "Room credentials shared on time."] },
      { code: "SEED-SQDRX-02", game: "BGMI",        mode: "Solo",  ratings: [5, 4],    comments: ["Super responsive host!", "Smooth tournament management."] },
    ],
  },
  {
    hostEmail: "battlesk@tournax.com",
    matches: [
      { code: "SEED-BTLSK-01", game: "Valorant",   mode: "Team",  ratings: [5, 5, 5], comments: ["Perfect host, zero issues!", "10/10 experience.", "Will always join BattleKing's tourneys."] },
      { code: "SEED-BTLSK-02", game: "PUBG PC",    mode: "Squad", ratings: [4, 5],    comments: ["Very professional.", "Great prizes and fast results."] },
    ],
  },
  {
    hostEmail: "tourneyvn@tournax.com",
    matches: [
      { code: "SEED-TRNVN-01", game: "BGMI",      mode: "Squad", ratings: [4, 3, 5], comments: ["Good host but results took time.", "Average experience.", "Love the prize pool setup!"] },
      { code: "SEED-TRNVN-02", game: "Free Fire", mode: "Solo",  ratings: [4, 4],    comments: ["Consistent and fair host.", "No issues, will join again."] },
    ],
  },
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
        password: await hashPassword(account.password),
        name: account.name,
        handle: account.handle,
        avatar: account.avatar,
        role: account.role,
        status: "active",
        profileSetup: true,
        balance: "0",
        followersCount: 0,
        followingCount: 0,
        recommended: false,
      });
      console.log(`[seed] Created default ${account.role} account`);
    }
  }

  const hostIds = new Map<string, number>();
  for (const host of DUMMY_HOSTS) {
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, host.email));
    if (existing) {
      hostIds.set(host.email, existing.id);
    } else {
      const [inserted] = await db.insert(usersTable).values({
        email: host.email,
        password: await hashPassword(host.password),
        name: host.name,
        handle: host.handle,
        avatar: host.avatar,
        role: "host",
        status: "active",
        profileSetup: true,
        balance: "0",
        followersCount: host.followersCount,
        followingCount: 0,
        recommended: true,
      }).returning({ id: usersTable.id });
      hostIds.set(host.email, inserted.id);
      console.log(`[seed] Created dummy host: @${host.handle}`);
    }
  }

  const playerIds: number[] = [];
  for (const player of DUMMY_PLAYERS) {
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, player.email));
    if (existing) {
      playerIds.push(existing.id);
    } else {
      const [inserted] = await db.insert(usersTable).values({
        email: player.email,
        password: await hashPassword(player.password),
        name: player.name,
        handle: player.handle,
        avatar: "🎯",
        role: "player",
        status: "active",
        profileSetup: true,
        balance: "0",
        followersCount: 0,
        followingCount: 0,
        recommended: false,
      }).returning({ id: usersTable.id });
      playerIds.push(inserted.id);
      console.log(`[seed] Created dummy player: @${player.handle}`);
    }
  }

  for (const { hostEmail, matches } of DUMMY_MATCHES) {
    const hostId = hostIds.get(hostEmail);
    if (!hostId) continue;

    for (const { code, game, mode, ratings, comments } of matches) {
      const [existingMatch] = await db.select({ id: matchesTable.id }).from(matchesTable).where(eq(matchesTable.code, code));
      let matchId: number;

      if (existingMatch) {
        matchId = existingMatch.id;
      } else {
        const [insertedMatch] = await db.insert(matchesTable).values({
          code,
          game,
          mode,
          teamSize: mode === "Solo" ? 1 : mode === "Duo" ? 2 : mode === "Team" ? 5 : 4,
          entryFee: "50",
          showcasePrizePool: "800",
          startTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          status: "completed",
          slots: 20,
          filledSlots: 20,
          hostId,
          description: "Completed tournament match",
          hostContribution: "0",
        }).returning({ id: matchesTable.id });
        matchId = insertedMatch.id;
        console.log(`[seed] Created completed match: ${code}`);
      }

      for (let i = 0; i < Math.min(ratings.length, playerIds.length); i++) {
        const reviewerId = playerIds[i];
        const [existingReview] = await db.select({ id: hostReviewsTable.id })
          .from(hostReviewsTable)
          .where(and(eq(hostReviewsTable.matchId, matchId), eq(hostReviewsTable.reviewerId, reviewerId)));

        if (!existingReview) {
          await db.insert(hostReviewsTable).values({
            matchId,
            reviewerId,
            hostId,
            rating: ratings[i],
            comment: comments[i] ?? null,
          });
        }
      }
    }
  }

  console.log("[seed] Dummy hosts + ratings seeded successfully");
}
