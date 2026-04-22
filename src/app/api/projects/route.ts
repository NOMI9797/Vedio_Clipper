import { count, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireBearer } from "@/lib/auth/bearer";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parseName(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const name = raw.trim();
  if (name.length < 1 || name.length > 200) {
    return null;
  }
  return name;
}

function parseIntParam(
  v: string | null,
  fallback: number,
  lo: number,
  hi: number
): number {
  if (v == null || v === "") {
    return fallback;
  }
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) {
    return fallback;
  }
  return Math.min(hi, Math.max(lo, n));
}

export async function GET(request: Request) {
  const auth = await requireBearer(request);
  if (!auth.ok) {
    return auth.response;
  }
  const { searchParams } = new URL(request.url);
  const limit = parseIntParam(
    searchParams.get("limit"),
    DEFAULT_LIMIT,
    1,
    MAX_LIMIT
  );
  const offset = parseIntParam(searchParams.get("offset"), 0, 0, 1_000_000);
  const take = limit + 1;
  const userId = auth.user.sub;
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.createdAt))
    .limit(take)
    .offset(offset);
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, -1) : rows;
  const [totalRow] = await db
    .select({ n: count() })
    .from(projects)
    .where(eq(projects.userId, userId));
  const total = totalRow?.n ?? 0;
  return NextResponse.json({
    data: data.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      createdAt: p.createdAt,
    })),
    pagination: {
      limit,
      offset,
      hasMore,
      total: Number(total),
    },
  });
}

export async function POST(request: Request) {
  const auth = await requireBearer(request);
  if (!auth.ok) {
    return auth.response;
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !("name" in body)) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }
  const name = parseName((body as { name: unknown }).name);
  if (!name) {
    return NextResponse.json(
      { error: "name must be 1–200 characters" },
      { status: 400 }
    );
  }
  const [created] = await db
    .insert(projects)
    .values({ userId: auth.user.sub, name })
    .returning({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      createdAt: projects.createdAt,
    });
  if (!created) {
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
  return NextResponse.json(created, { status: 201 });
}
