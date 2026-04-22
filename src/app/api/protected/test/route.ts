import { NextResponse } from "next/server";

import { requireBearer } from "@/lib/auth/bearer";

export async function GET(request: Request) {
  const auth = await requireBearer(request);
  if (!auth.ok) {
    return auth.response;
  }
  return NextResponse.json({
    ok: true,
    userId: auth.user.sub,
    email: auth.user.email,
  });
}
