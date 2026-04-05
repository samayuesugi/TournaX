import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { usersTable, userCosmeticsTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "./auth";

const router: IRouter = Router();

export type CosmeticCategory = "frame" | "badge" | "handle_color";

export interface CosmeticItem {
  id: string;
  category: CosmeticCategory;
  name: string;
  description: string;
  emoji: string;
  cost: number;
  cssValue: string;
}

export const STORE_ITEMS: CosmeticItem[] = [
  // Avatar Frames
  { id: "frame-fire",    category: "frame", name: "Fire Ring",    description: "Burn bright with a blazing orange frame",    emoji: "🔥", cost: 50,  cssValue: "ring-2 ring-orange-500 ring-offset-2 ring-offset-background" },
  { id: "frame-galaxy",  category: "frame", name: "Galaxy Ring",  description: "Mysterious cosmic purple-blue border",        emoji: "🌌", cost: 80,  cssValue: "ring-2 ring-purple-500 ring-offset-2 ring-offset-background" },
  { id: "frame-gold",    category: "frame", name: "Gold Ring",    description: "Show off your status with gleaming gold",     emoji: "✨", cost: 100, cssValue: "ring-2 ring-amber-400 ring-offset-2 ring-offset-background" },
  { id: "frame-neon",    category: "frame", name: "Neon Ring",    description: "Electric cyan glow that stands out",          emoji: "⚡", cost: 120, cssValue: "ring-2 ring-cyan-400 ring-offset-2 ring-offset-background" },
  { id: "frame-legend",  category: "frame", name: "Legend Aura",  description: "Red champion aura for true legends",         emoji: "👑", cost: 200, cssValue: "ring-2 ring-red-500 ring-offset-2 ring-offset-background shadow-[0_0_12px_2px_rgba(239,68,68,0.5)]" },

  // Profile Badges
  { id: "badge-warrior",  category: "badge", name: "Warrior",  description: "For those who never back down",           emoji: "⚔️", cost: 30,  cssValue: "⚔️" },
  { id: "badge-ghost",    category: "badge", name: "Ghost",    description: "Silent, deadly — impossible to catch",    emoji: "👻", cost: 40,  cssValue: "👻" },
  { id: "badge-champion", category: "badge", name: "Champion", description: "Proven winner across multiple tourneys",  emoji: "🏆", cost: 60,  cssValue: "🏆" },
  { id: "badge-dragon",   category: "badge", name: "Dragon",   description: "Rare prestige badge for elite players",   emoji: "🐲", cost: 80,  cssValue: "🐲" },
  { id: "badge-legend",   category: "badge", name: "Legend",   description: "The highest badge — for the chosen few",  emoji: "👑", cost: 100, cssValue: "👑" },

  // Handle Colors
  { id: "color-purple", category: "handle_color", name: "Purple",  description: "Vibrant royal purple handle",        emoji: "💜", cost: 40,  cssValue: "text-purple-400" },
  { id: "color-red",    category: "handle_color", name: "Red",     description: "Bold danger-red handle",             emoji: "❤️", cost: 50,  cssValue: "text-red-400" },
  { id: "color-green",  category: "handle_color", name: "Green",   description: "Toxic neon-green handle",            emoji: "💚", cost: 50,  cssValue: "text-green-400" },
  { id: "color-cyan",   category: "handle_color", name: "Cyan",    description: "Ice-cold electric cyan handle",      emoji: "🩵", cost: 60,  cssValue: "text-cyan-400" },
  { id: "color-gold",   category: "handle_color", name: "Gold",    description: "Prestigious gold handle color",      emoji: "💛", cost: 70,  cssValue: "text-amber-400" },
];

router.get("/store/items", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const owned = await db
    .select({ itemId: userCosmeticsTable.itemId })
    .from(userCosmeticsTable)
    .where(eq(userCosmeticsTable.userId, user.id));

  const ownedSet = new Set(owned.map((o) => o.itemId));

  const [userData] = await db
    .select({ equippedFrame: usersTable.equippedFrame, equippedBadge: usersTable.equippedBadge, equippedHandleColor: usersTable.equippedHandleColor })
    .from(usersTable)
    .where(eq(usersTable.id, user.id));

  res.json({
    items: STORE_ITEMS,
    owned: Array.from(ownedSet),
    equipped: {
      frame: userData?.equippedFrame ?? null,
      badge: userData?.equippedBadge ?? null,
      handle_color: userData?.equippedHandleColor ?? null,
    },
  });
});

router.post("/store/buy/:itemId", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { itemId } = req.params;

  const item = STORE_ITEMS.find((i) => i.id === itemId);
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  const [existing] = await db
    .select({ id: userCosmeticsTable.id })
    .from(userCosmeticsTable)
    .where(and(eq(userCosmeticsTable.userId, user.id), eq(userCosmeticsTable.itemId, itemId)));

  if (existing) {
    res.status(400).json({ error: "You already own this item" });
    return;
  }

  const [freshUser] = await db.select({ silverCoins: usersTable.silverCoins }).from(usersTable).where(eq(usersTable.id, user.id));
  if ((freshUser?.silverCoins ?? 0) < item.cost) {
    res.status(400).json({ error: `Not enough Silver Coins. You need ${item.cost}, you have ${freshUser?.silverCoins ?? 0}.` });
    return;
  }

  await db.execute(sql`UPDATE users SET silver_coins = silver_coins - ${item.cost} WHERE id = ${user.id} AND silver_coins >= ${item.cost}`);
  await db.insert(userCosmeticsTable).values({ userId: user.id, itemId: item.id, category: item.category });

  res.json({ success: true, message: `Purchased ${item.name}!`, item });
});

router.post("/store/equip/:itemId", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { itemId } = req.params;

  const item = STORE_ITEMS.find((i) => i.id === itemId);
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  const [owned] = await db
    .select({ id: userCosmeticsTable.id })
    .from(userCosmeticsTable)
    .where(and(eq(userCosmeticsTable.userId, user.id), eq(userCosmeticsTable.itemId, itemId)));

  if (!owned) {
    res.status(403).json({ error: "You don't own this item" });
    return;
  }

  if (item.category === "frame") {
    await db.update(usersTable).set({ equippedFrame: itemId }).where(eq(usersTable.id, user.id));
  } else if (item.category === "badge") {
    await db.update(usersTable).set({ equippedBadge: itemId }).where(eq(usersTable.id, user.id));
  } else if (item.category === "handle_color") {
    await db.update(usersTable).set({ equippedHandleColor: itemId }).where(eq(usersTable.id, user.id));
  }

  res.json({ success: true, message: `Equipped ${item.name}!` });
});

router.post("/store/unequip/:category", requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { category } = req.params;

  if (category === "frame") {
    await db.update(usersTable).set({ equippedFrame: null }).where(eq(usersTable.id, user.id));
  } else if (category === "badge") {
    await db.update(usersTable).set({ equippedBadge: null }).where(eq(usersTable.id, user.id));
  } else if (category === "handle_color") {
    await db.update(usersTable).set({ equippedHandleColor: null }).where(eq(usersTable.id, user.id));
  }

  res.json({ success: true });
});

export default router;
