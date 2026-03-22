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

export default router;
