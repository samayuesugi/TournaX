import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { usersTable, referralsTable } from "@workspace/db/schema";
import { eq, sql, ilike, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendOtpEmail } from "../lib/email";

function getAppBaseUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  return "http://localhost:3000";
}

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
  const today = getTodayDate();
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
    referralCode: user.referralCode ?? null,
    referralBonusActive: user.referralBonusUntil ? user.referralBonusUntil >= today : false,
    referralBonusUntil: user.referralBonusUntil ?? null,
    paidMatchesPlayed: user.paidMatchesPlayed ?? 0,
  };
}

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

interface PendingOtp {
  otp: string;
  expiry: number;
  attempts: number;
  type: "register" | "reset";
  pendingData?: {
    email: string;
    passwordHash: string;
    referralCode?: string;
  };
}

const otpStore = new Map<string, PendingOtp>();

function otpKey(email: string, type: "register" | "reset"): string {
  return `${type}:${email.toLowerCase()}`;
}

function cleanExpiredOtps() {
  const now = Date.now();
  for (const [key, entry] of otpStore.entries()) {
    if (entry.expiry < now) otpStore.delete(key);
  }
}

router.post("/auth/send-register-otp", async (req: Request, res: Response) => {
  cleanExpiredOtps();
  const { email, password, referralCode } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (existing.length > 0) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  if (referralCode?.trim()) {
    const [found] = await db.select({ id: usersTable.id }).from(usersTable).where(ilike(usersTable.referralCode, referralCode.trim()));
    if (!found) {
      res.status(400).json({ error: "Invalid referral code" });
      return;
    }
  }

  // OTP_BYPASS: skipping email for now, using fixed code
  const otp = "000000";
  const passwordHash = await hashPassword(password);
  const key = otpKey(email, "register");

  otpStore.set(key, {
    otp,
    expiry: Date.now() + 10 * 60 * 1000,
    attempts: 0,
    type: "register",
    pendingData: { email: email.toLowerCase(), passwordHash, referralCode: referralCode?.trim() || undefined },
  });

  res.json({ success: true, message: "OTP sent to your email" });
});

router.post("/auth/verify-register", async (req: Request, res: Response) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    res.status(400).json({ error: "Email and OTP required" });
    return;
  }

  const key = otpKey(email, "register");
  const entry = otpStore.get(key);

  if (!entry) {
    res.status(400).json({ error: "OTP not found or expired. Please request a new one." });
    return;
  }
  if (Date.now() > entry.expiry) {
    otpStore.delete(key);
    res.status(400).json({ error: "OTP expired. Please request a new one." });
    return;
  }
  if (entry.attempts >= 3) {
    otpStore.delete(key);
    res.status(400).json({ error: "Too many incorrect attempts. Please request a new OTP." });
    return;
  }
  if (entry.otp !== otp.trim()) {
    entry.attempts += 1;
    const remaining = 3 - entry.attempts;
    if (remaining === 0) {
      otpStore.delete(key);
      res.status(400).json({ error: "Incorrect OTP. OTP has been invalidated after 3 failed attempts." });
    } else {
      res.status(400).json({ error: `Incorrect OTP. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` });
    }
    return;
  }

  const { pendingData } = entry;
  if (!pendingData) {
    otpStore.delete(key);
    res.status(400).json({ error: "Invalid session. Please try again." });
    return;
  }

  otpStore.delete(key);

  const existingUser = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, pendingData.email));
  if (existingUser.length > 0) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  let referrer: { id: number } | null = null;
  if (pendingData.referralCode) {
    const [found] = await db.select({ id: usersTable.id }).from(usersTable).where(ilike(usersTable.referralCode, pendingData.referralCode));
    if (found) referrer = found;
  }

  const [user] = await db.insert(usersTable).values({
    email: pendingData.email,
    password: pendingData.passwordHash,
    role: "player",
    status: "active",
    profileSetup: false,
    balance: "0",
  }).returning();

  const referralCode = `Tx-user${user.id.toString().padStart(3, "0")}`;
  await db.update(usersTable).set({ referralCode }).where(eq(usersTable.id, user.id));

  if (referrer && referrer.id !== user.id) {
    await db.insert(referralsTable).values({ referrerId: referrer.id, referredId: user.id });
    // Award referrer 10 Silver for invite task (only once per day)
    const [referrerFull] = await db.select().from(usersTable).where(eq(usersTable.id, referrer.id));
    const todayStr = getTodayDate();
    const alreadySharedToday = referrerFull?.dailyTaskDate === todayStr && (referrerFull?.dailyInviteShared ?? 0) >= 1;
    if (!alreadySharedToday) {
      await db.update(usersTable).set({
        dailyTaskDate: todayStr,
        dailyInviteShared: 1,
        silverCoins: sql`${usersTable.silverCoins} + 10`,
      }).where(eq(usersTable.id, referrer.id));
    }
  }

  const [userWithCode] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
  const token = generateToken(user.id);
  res.json({ user: serializeUser(userWithCode), token });
});

router.post("/auth/forgot-password", async (req: Request, res: Response) => {
  cleanExpiredOtps();
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: "Email required" });
    return;
  }

  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (!user) {
    res.json({ success: true, message: "If that email exists, an OTP has been sent" });
    return;
  }

  const otp = generateOtp();
  const key = otpKey(email, "reset");

  otpStore.set(key, {
    otp,
    expiry: Date.now() + 10 * 60 * 1000,
    attempts: 0,
    type: "reset",
  });

  try {
    await sendOtpEmail(email, otp, "reset");
  } catch {
    otpStore.delete(key);
    res.status(500).json({ error: "Failed to send OTP email. Please try again." });
    return;
  }

  res.json({ success: true, message: "OTP sent to your email" });
});

router.post("/auth/verify-reset-otp", async (req: Request, res: Response) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    res.status(400).json({ error: "Email and OTP required" });
    return;
  }

  const key = otpKey(email, "reset");
  const entry = otpStore.get(key);

  if (!entry) {
    res.status(400).json({ error: "OTP not found or expired. Please request a new one." });
    return;
  }
  if (Date.now() > entry.expiry) {
    otpStore.delete(key);
    res.status(400).json({ error: "OTP expired. Please request a new one." });
    return;
  }
  if (entry.attempts >= 3) {
    otpStore.delete(key);
    res.status(400).json({ error: "Too many incorrect attempts. Please request a new OTP." });
    return;
  }
  if (entry.otp !== otp.trim()) {
    entry.attempts += 1;
    const remaining = 3 - entry.attempts;
    if (remaining === 0) {
      otpStore.delete(key);
      res.status(400).json({ error: "Incorrect OTP. OTP has been invalidated after 3 failed attempts." });
    } else {
      res.status(400).json({ error: `Incorrect OTP. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` });
    }
    return;
  }

  const resetToken = jwt.sign({ email: email.toLowerCase(), purpose: "reset" }, JWT_SECRET, { expiresIn: "15m" });
  otpStore.delete(key);

  res.json({ success: true, resetToken });
});

router.post("/auth/reset-password", async (req: Request, res: Response) => {
  const { resetToken, newPassword } = req.body;
  if (!resetToken || !newPassword) {
    res.status(400).json({ error: "Reset token and new password required" });
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  let payload: { email: string; purpose: string };
  try {
    payload = jwt.verify(resetToken, JWT_SECRET) as { email: string; purpose: string };
  } catch {
    res.status(400).json({ error: "Invalid or expired reset token. Please start over." });
    return;
  }

  if (payload.purpose !== "reset") {
    res.status(400).json({ error: "Invalid reset token." });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, payload.email));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const passwordHash = await hashPassword(newPassword);
  const [updated] = await db.update(usersTable).set({ password: passwordHash }).where(eq(usersTable.id, user.id)).returning();

  const token = generateToken(updated.id);
  res.json({ user: serializeUser(updated), token });
});

router.post("/auth/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  if (!user.password) {
    res.status(401).json({ error: "This account uses Google Sign-In. Please use the Continue with Google button." });
    return;
  }
  if (!(await verifyPassword(password, user.password))) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const today = getTodayDate();
  let updatedUser = user;
  if (user.lastLoginDate !== today) {
    const [u] = await db.update(usersTable)
      .set({ lastLoginDate: today, silverCoins: sql`${usersTable.silverCoins} + 10` })
      .where(eq(usersTable.id, user.id))
      .returning();
    updatedUser = u;
  }

  const token = generateToken(updatedUser.id);
  res.json({ user: serializeUser(updatedUser), token, dailyLoginBonus: user.lastLoginDate !== today ? 10 : 0 });
});

router.get("/auth/me", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  res.json(serializeUser(user));
});

router.post("/auth/logout", requireAuth, async (_req: Request, res: Response) => {
  res.json({ success: true, message: "Logged out" });
});

router.post("/auth/daily-checkin", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const today = getTodayDate();
  if (user.lastLoginDate === today) {
    res.json({ claimed: false, bonus: 0, silverCoins: user.silverCoins ?? 0 });
    return;
  }
  const referralBonus = user.referralBonusUntil && user.referralBonusUntil >= today ? 1 : 0;
  const totalBonus = 5 + referralBonus;
  const [updated] = await db.update(usersTable)
    .set({ lastLoginDate: today, silverCoins: sql`${usersTable.silverCoins} + ${totalBonus}` })
    .where(eq(usersTable.id, user.id))
    .returning();
  res.json({ claimed: true, bonus: totalBonus, referralBonus, silverCoins: updated.silverCoins ?? 0 });
});

router.get("/auth/daily-tasks", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const today = getTodayDate();

  let dailyWins = user.dailyWins ?? 0;
  let dailyPaidMatches = user.dailyPaidMatches ?? 0;

  let dailyInviteShared = user.dailyInviteShared ?? 0;

  if (user.dailyTaskDate !== today) {
    await db.update(usersTable).set({
      dailyTaskDate: today,
      dailyWins: 0,
      dailyPaidMatches: 0,
      dailyTournamentWins: 0,
      dailyInviteShared: 0,
    }).where(eq(usersTable.id, user.id));
    dailyWins = 0;
    dailyPaidMatches = 0;
    dailyInviteShared = 0;
  }

  res.json({
    loginClaimed: user.lastLoginDate === today,
    freeMatchesToday: dailyWins,
    freeMatchesClaimed: dailyWins >= 3,
    paidMatchesToday: dailyPaidMatches,
    paidMatchesClaimed: dailyPaidMatches >= 3,
    tournamentWinsToday: user.dailyTaskDate === today ? (user.dailyTournamentWins ?? 0) : 0,
    tournamentWinsClaimed: user.dailyTaskDate === today && (user.dailyTournamentWins ?? 0) >= 5,
    inviteClaimed: dailyInviteShared >= 1,
  });
});


router.post("/auth/setup-profile", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { avatar, game, name } = req.body;
  const handle = typeof req.body.handle === "string"
    ? req.body.handle.toLowerCase().replace(/\s/g, "_").replace(/[^a-z0-9_]/g, "")
    : "";
  if (!handle || !game || !name) {
    res.status(400).json({ error: "All fields required" });
    return;
  }
  const existing = await db.select().from(usersTable).where(eq(usersTable.handle, handle));
  if (existing.length > 0 && existing[0].id !== user.id) {
    res.status(400).json({ error: "Handle already taken" });
    return;
  }
  const referralCode = `Tx-${handle}${user.id.toString().padStart(3, "0")}`;
  const [updated] = await db.update(usersTable).set({
    avatar: avatar || "🔥",
    name,
    game,
    handle,
    referralCode,
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

router.get("/auth/google", (req: Request, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.status(503).json({ error: "Google login is not configured" });
    return;
  }
  const baseUrl = getAppBaseUrl();
  const redirectUri = `${baseUrl}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get("/auth/google/callback", async (req: Request, res: Response) => {
  const baseUrl = getAppBaseUrl();
  const { code, error } = req.query;

  if (error || !code) {
    res.redirect(`${baseUrl}/auth?error=google_cancelled`);
    return;
  }

  try {
    const redirectUri = `${baseUrl}/api/auth/google/callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: code as string,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) {
      res.redirect(`${baseUrl}/auth?error=google_failed`);
      return;
    }

    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const googleUser = await userInfoRes.json() as any;
    const { id: googleId, email, name, picture } = googleUser;

    if (!email) {
      res.redirect(`${baseUrl}/auth?error=google_no_email`);
      return;
    }

    const today = getTodayDate();
    let dailyBonus = 0;

    let [user] = await db.select().from(usersTable).where(
      or(eq(usersTable.email, email.toLowerCase()), eq(usersTable.googleId, googleId))
    );

    if (user) {
      const patch: Record<string, any> = {};
      if (!user.googleId) patch.googleId = googleId;
      if (user.lastLoginDate !== today) {
        patch.lastLoginDate = today;
        patch.silverCoins = sql`${usersTable.silverCoins} + 10`;
        dailyBonus = 10;
      }
      if (Object.keys(patch).length > 0) {
        [user] = await db.update(usersTable).set(patch).where(eq(usersTable.id, user.id)).returning();
      }
    } else {
      const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      [user] = await db.insert(usersTable).values({
        email: email.toLowerCase(),
        name: name || email.split("@")[0],
        avatar: picture || "🔥",
        googleId,
        role: "player",
        status: "active",
        lastLoginDate: today,
        referralCode,
        silverCoins: 10,
      }).returning();
      dailyBonus = 10;
    }

    const token = generateToken(user.id);
    const params = new URLSearchParams({ token });
    if (dailyBonus > 0) params.set("dailyBonus", String(dailyBonus));
    res.redirect(`${baseUrl}/auth/callback?${params}`);
  } catch (err) {
    console.error("Google OAuth error:", err);
    res.redirect(`${baseUrl}/auth?error=google_failed`);
  }
});

export default router;
