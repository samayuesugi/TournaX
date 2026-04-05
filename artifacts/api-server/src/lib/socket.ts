import { Server } from "socket.io";
import type { Server as HttpServer } from "http";
import { verifyToken } from "../routes/auth";
import { db } from "@workspace/db";
import { usersTable, groupMembersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";

let io: Server | null = null;

export function initSocketIO(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: { origin: "*", credentials: true },
    path: "/api/socket.io/",
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("Unauthorized"));
    const payload = verifyToken(token);
    if (!payload) return next(new Error("Invalid token"));
    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, payload.userId));
    if (!user) return next(new Error("User not found"));
    socket.data.userId = user.id;
    next();
  });

  io.on("connection", (socket) => {
    const userId: number = socket.data.userId;
    socket.join(`user-${userId}`);
    logger.debug({ userId, socketId: socket.id }, "Socket connected");

    socket.on("join:group", async ({ groupId }: { groupId: number }) => {
      try {
        const members = await db
          .select({ id: groupMembersTable.userId })
          .from(groupMembersTable)
          .where(
            and(
              eq(groupMembersTable.groupId, groupId),
              eq(groupMembersTable.userId, userId),
            ),
          );
        if (members.length > 0) {
          socket.join(`group-${groupId}`);
        }
      } catch (err) {
        logger.error({ err }, "Error joining group room");
      }
    });

    socket.on("disconnect", () => {
      logger.debug({ userId, socketId: socket.id }, "Socket disconnected");
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) throw new Error("Socket.IO not initialized");
  return io;
}
