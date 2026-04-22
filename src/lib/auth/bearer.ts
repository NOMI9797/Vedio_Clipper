import type { AccessTokenPayload } from "@/lib/auth/jwt";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { NextResponse } from "next/server";

export function parseBearer(authorization: string | null): string | null {
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }
  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export type AuthResult =
  | { ok: true; user: AccessTokenPayload }
  | { ok: false; response: NextResponse };

export async function requireBearer(
  request: Request
): Promise<AuthResult> {
  const token = parseBearer(request.headers.get("authorization"));
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      ),
    };
  }
  try {
    const user = await verifyAccessToken(token);
    return { ok: true, user };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      ),
    };
  }
}
