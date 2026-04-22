import * as jose from "jose";

const ACCESS_TTL = "15m";
const REFRESH_TTL = "7d";

export type TokenUse = "access" | "refresh";

function getSecret(): Uint8Array {
  const s = process.env.AUTH_JWT_SECRET;
  if (!s) {
    throw new Error("AUTH_JWT_SECRET is not set");
  }
  return new TextEncoder().encode(s);
}

export async function createAccessToken(input: {
  sub: string;
  email: string;
}): Promise<string> {
  return new jose.SignJWT({
    email: input.email,
    tokenUse: "access" as const,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.sub)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(getSecret());
}

export async function createRefreshToken(input: {
  sub: string;
  email: string;
}): Promise<string> {
  return new jose.SignJWT({
    email: input.email,
    tokenUse: "refresh" as const,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.sub)
    .setIssuedAt()
    .setExpirationTime(REFRESH_TTL)
    .sign(getSecret());
}

export type AccessTokenPayload = {
  sub: string;
  email: string;
};

export async function verifyAccessToken(
  token: string
): Promise<AccessTokenPayload> {
  const { payload } = await jose.jwtVerify(token, getSecret());
  if (payload.tokenUse !== "access") {
    throw new jose.errors.JWTInvalid("Invalid access token use");
  }
  const sub = payload.sub;
  const email = payload.email;
  if (typeof sub !== "string" || typeof email !== "string") {
    throw new jose.errors.JWTInvalid("Invalid access token claims");
  }
  return { sub, email };
}

export async function verifyRefreshToken(token: string): Promise<{
  sub: string;
  email: string;
}> {
  const { payload } = await jose.jwtVerify(token, getSecret());
  if (payload.tokenUse !== "refresh") {
    throw new jose.errors.JWTInvalid("Invalid refresh token use");
  }
  const sub = payload.sub;
  const email = payload.email;
  if (typeof sub !== "string" || typeof email !== "string") {
    throw new jose.errors.JWTInvalid("Invalid refresh token claims");
  }
  return { sub, email };
}
