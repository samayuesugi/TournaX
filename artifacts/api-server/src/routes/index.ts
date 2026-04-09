import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import matchesRouter from "./matches";
import usersRouter from "./users";
import walletRouter from "./wallet";
import adminRouter from "./admin";
import gamesRouter from "./games";
import groupsRouter from "./groups";
import storageRouter from "./storage";
import leaderboardRouter from "./leaderboard";
import referralRouter from "./referral";
import auctionsRouter from "./auctions";
import pushRouter from "./push";
import postsRouter from "./posts";
import storeRouter from "./store";
import aiRefereeRouter from "./ai-referee";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(matchesRouter);
router.use(usersRouter);
router.use(walletRouter);
router.use(adminRouter);
router.use(gamesRouter);
router.use(groupsRouter);
router.use(storageRouter);
router.use(leaderboardRouter);
router.use(referralRouter);
router.use(auctionsRouter);
router.use(pushRouter);
router.use(postsRouter);
router.use(storeRouter);
router.use(aiRefereeRouter);

export default router;
