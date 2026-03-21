import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { gamesTable, gameModesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "./auth";

const router: IRouter = Router();

async function requireAdmin(req: Request, res: Response, next: Function) {
  await requireAuth(req, res, async () => {
    const user = (req as any).user;
    if (user.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  });
}

async function serializeGame(game: typeof gamesTable.$inferSelect) {
  const modes = await db.select().from(gameModesTable).where(eq(gameModesTable.gameId, game.id));
  return {
    id: game.id,
    name: game.name,
    modes: modes.map((m) => ({ id: m.id, name: m.name, teamSize: m.teamSize })),
  };
}

router.get("/games", requireAuth, async (_req: Request, res: Response) => {
  const games = await db.select().from(gamesTable);
  const serialized = await Promise.all(games.map(serializeGame));
  res.json(serialized);
});

router.post("/admin/games", requireAdmin, async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name) { res.status(400).json({ error: "Game name required" }); return; }
  const existing = await db.select().from(gamesTable).where(eq(gamesTable.name, name));
  if (existing.length > 0) { res.status(400).json({ error: "Game already exists" }); return; }
  const [game] = await db.insert(gamesTable).values({ name }).returning();
  res.json(await serializeGame(game));
});

router.delete("/admin/games/:id", requireAdmin, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  await db.delete(gameModesTable).where(eq(gameModesTable.gameId, id));
  await db.delete(gamesTable).where(eq(gamesTable.id, id));
  res.json({ success: true });
});

router.post("/admin/games/:id/modes", requireAdmin, async (req: Request, res: Response) => {
  const gameId = Number(req.params.id);
  const { name, teamSize } = req.body;
  if (!name) { res.status(400).json({ error: "Mode name required" }); return; }
  const [mode] = await db.insert(gameModesTable).values({
    gameId,
    name,
    teamSize: Number(teamSize) || 1,
  }).returning();
  res.json({ id: mode.id, name: mode.name, teamSize: mode.teamSize });
});

router.delete("/admin/games/:gameId/modes/:modeId", requireAdmin, async (req: Request, res: Response) => {
  await db.delete(gameModesTable).where(eq(gameModesTable.id, Number(req.params.modeId)));
  res.json({ success: true });
});

export default router;
