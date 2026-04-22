import { NextResponse } from "next/server";

import { authorizeUser } from "@/lib/auth/authorize-user";
import { createAccessToken, createRefreshToken } from "@/lib/auth/jwt";

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
  const email = (body as { email: string }).email;
  const password = (body as { password: string }).password;
  if (!process.env.AUTH_JWT_SECRET) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }
  const user = await authorizeUser(email, password);
  if (!user) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 }
    );
  }
  const [accessToken, refreshToken] = await Promise.all([
    createAccessToken({ sub: user.id, email: user.email }),
    createRefreshToken({ sub: user.id, email: user.email }),
  ]);
  return NextResponse.json({
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email },
  });
}
