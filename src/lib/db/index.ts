import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool: pg.Pool | undefined };

const pool =
  globalForDb.pool ??
  new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}

export const db = drizzle(pool, { schema });
export { pool };
