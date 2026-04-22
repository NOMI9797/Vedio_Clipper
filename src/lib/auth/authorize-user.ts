import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { users, type User } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/password";

export async function authorizeUser(
  email: string,
  password: string
): Promise<User | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);
  if (!row) {
    return null;
  }
  const ok = await verifyPassword(password, row.passwordHash);
  if (!ok) {
    return null;
  }
  return row;
}
