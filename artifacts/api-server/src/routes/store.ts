import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { usersTable, userCosmeticsTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "./auth";
import { STORE_ITEMS } from "../config/store-items.js";

export type { CosmeticCategory, CosmeticItem } from "../config/store-items.js";
export { STORE_ITEMS };

const router: IRouter = Router();

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

  const isHostOrAdmin = user.role === "host" || user.role === "admin";

  if (!isHostOrAdmin) {
    const [owned] = await db
      .select({ id: userCosmeticsTable.id })
      .from(userCosmeticsTable)
      .where(and(eq(userCosmeticsTable.userId, user.id), eq(userCosmeticsTable.itemId, itemId)));

    if (!owned) {
      res.status(403).json({ error: "You don't own this item" });
      return;
    }
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
