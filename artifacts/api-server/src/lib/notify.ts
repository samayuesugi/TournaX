import webpush from "web-push";
import { db } from "@workspace/db";
import { notificationsTable, pushSubscriptionsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || "mailto:admin@tournax.app",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

export async function notify(
  userId: number,
  type: string,
  message: string,
  url?: string,
) {
  await db.insert(notificationsTable).values({ userId, type, message });

  const subs = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.userId, userId));

  const payload = JSON.stringify({ title: "TournaX", body: message, url: url || "/" });

  await Promise.allSettled(
    subs.map(async (row) => {
      try {
        await webpush.sendNotification(row.subscription as any, payload);
      } catch (err: any) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await db
            .delete(pushSubscriptionsTable)
            .where(eq(pushSubscriptionsTable.id, row.id));
        }
      }
    }),
  );
}
