import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const router: IRouter = Router();

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable must be set");
}
const JWT_SECRET = process.env.JWT_SECRET;

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function generateToken(userId: number): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): { userId: number } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: number };
  } catch {
    return null;
  }
}

export async function requireAuth(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId));
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  (req as any).user = user;
  next();
}

function serializeUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    handle: user.handle,
    avatar: user.avatar || "🔥",
    game: user.game,
    gameUid: user.gameUid,
    role: user.role,
    balance: parseFloat(user.balance as string),
    silverCoins: user.silverCoins ?? 0,
    status: user.status,
    profileSetup: user.profileSetup,
    followersCount: user.followersCount,
    followingCount: user.followingCount,
    instagram: user.instagram,
    discord: user.discord,
    x: user.x,
    youtube: user.youtube,
    twitch: user.twitch,
  };
}

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

router.post("/auth/register", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }
  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing.length > 0) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }
  const [user] = await db.insert(usersTable).values({
    email,
    password: await hashPassword(password),
    role: "player",
    status: "active",
    profileSetup: false,
    balance: "0",
  }).returning();
  const token = generateToken(user.id);
  res.json({ user: serializeUser(user), token });
});

router.post("/auth/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user || !(await verifyPassword(password, user.password))) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const today = getTodayDate();
  let updatedUser = user;
  if (user.lastLoginDate !== today) {
    const [u] = await db.update(usersTable)
      .set({ lastLoginDate: today, silverCoins: sql`${usersTable.silverCoins} + 2` })
      .where(eq(usersTable.id, user.id))
      .returning();
    updatedUser = u;
  }

  const token = generateToken(updatedUser.id);
  res.json({ user: serializeUser(updatedUser), token, dailyLoginBonus: user.lastLoginDate !== today ? 2 : 0 });
});

router.get("/auth/me", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  res.json(serializeUser(user));
});

router.post("/auth/logout", requireAuth, async (_req: Request, res: Response) => {
  res.json({ success: true, message: "Logged out" });
});

router.post("/auth/setup-profile", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { avatar, game, ign, gameUid } = req.body;
  const handle = typeof req.body.handle === "string"
    ? req.body.handle.toLowerCase().replace(/\s/g, "_").replace(/[^a-z0-9_]/g, "")
    : "";
  if (!handle || !ign || !gameUid || !game) {
    res.status(400).json({ error: "All fields required" });
    return;
  }
  const existing = await db.select().from(usersTable).where(eq(usersTable.handle, handle));
  if (existing.length > 0 && existing[0].id !== user.id) {
    res.status(400).json({ error: "Handle already taken" });
    return;
  }
  const [updated] = await db.update(usersTable).set({
    avatar: avatar || "🔥",
    game,
    name: ign,
    handle,
    gameUid,
    profileSetup: true,
    status: "active",
  }).where(eq(usersTable.id, user.id)).returning();
  res.json(serializeUser(updated));
});

router.patch("/auth/me", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { name, handle } = req.body;
  if (!name?.trim() && !handle?.trim()) {
    res.status(400).json({ error: "Nothing to update" }); return;
  }
  const updates: Record<string, any> = {};
  if (name?.trim()) updates.name = name.trim();
  if (handle?.trim()) {
    const cleaned = handle.trim().toLowerCase().replace(/\s/g, "_").replace(/[^a-z0-9_]/g, "");
    if (!cleaned) { res.status(400).json({ error: "Invalid handle" }); return; }
    const existing = await db.select().from(usersTable).where(eq(usersTable.handle, cleaned));
    if (existing.length > 0 && existing[0].id !== user.id) {
      res.status(400).json({ error: "Handle already taken" }); return;
    }
    updates.handle = cleaned;
  }
  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, user.id)).returning();
  res.json(serializeUser(updated));
});

export default router;
