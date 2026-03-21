import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import jwt from "jsonwebtoken";

const router: IRouter = Router();

if (!process.env.JWT_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("JWT_SECRET environment variable must be set in production");
}
const JWT_SECRET = process.env.JWT_SECRET || "tournax-secret-key-2024";

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "tournax_salt").digest("hex");
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
    status: user.status,
    profileSetup: user.profileSetup,
    followersCount: user.followersCount,
    followingCount: user.followingCount,
  };
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
    password: hashPassword(password),
    role: "player",
    status: "active",
    profileSetup: false,
    balance: "100",
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
  if (!user || user.password !== hashPassword(password)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  const token = generateToken(user.id);
  res.json({ user: serializeUser(user), token });
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
  const { avatar, game, ign, handle, gameUid } = req.body;
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

export default router;
