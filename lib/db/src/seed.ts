import crypto from "crypto";
import { db } from "./index";
import { usersTable } from "./schema";
import { eq } from "drizzle-orm";

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "tournax_salt").digest("hex");
}

const DEFAULT_ACCOUNTS = [
  {
    email: "admin@tournax.com",
    password: "admin@123",
    name: "Admin",
    handle: "admin",
    avatar: "⚡",
    role: "admin" as const,
  },
  {
    email: "host@tournax.com",
    password: "host@123",
    name: "Sample Host",
    handle: "samplehost",
    avatar: "🎮",
    role: "host" as const,
  },
];

export async function seedDefaults() {
  for (const account of DEFAULT_ACCOUNTS) {
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, account.email));

    if (!existing) {
      await db.insert(usersTable).values({
        email: account.email,
        password: hashPassword(account.password),
        name: account.name,
        handle: account.handle,
        avatar: account.avatar,
        role: account.role,
        status: "active",
        profileSetup: true,
        balance: "0",
        followersCount: 0,
        followingCount: 0,
      });
      console.log(`[seed] Created default ${account.role}: ${account.email}`);
    }
  }
}
