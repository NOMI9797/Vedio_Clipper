import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { createAccessToken, createRefreshToken } from "@/lib/auth/jwt";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("email" in body) ||
    !("password" in body) ||
    typeof (body as { email: unknown }).email !== "string" ||
    typeof (body as { password: unknown }).password !== "string"
  ) {
    return NextResponse.json(
      { error: "email and password are required" },
      { status: 400 }
    );
  }
  const email = (body as { email: string }).email.trim().toLowerCase();
  const password = (body as { password: string }).password;
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Invalid email format" },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }
  if (!process.env.AUTH_JWT_SECRET) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 }
    );
  }
  const passwordHash = await hashPassword(password);
  let created: { id: string; email: string } | undefined;
  try {
    [created] = await db
      .insert(users)
      .values({ email, passwordHash })
      .returning({ id: users.id, email: users.email });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "23505") {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }
    throw e;
  }
  if (!created) {
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }
  const [accessToken, refreshToken] = await Promise.all([
    createAccessToken({ sub: created.id, email: created.email }),
    createRefreshToken({ sub: created.id, email: created.email }),
  ]);
  return NextResponse.json(
    {
      accessToken,
      refreshToken,
      user: { id: created.id, email: created.email },
    },
    { status: 201 }
  );
}
