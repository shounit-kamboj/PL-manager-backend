import type { Request } from "express";
import { sql } from "drizzle-orm";

// Postgres CURRENT_DATE is in the database's timezone (UTC on Neon), so it flips to tomorrow at 5 pm Vancouver time.
// The coach's own "today" (yyyy-mm-dd) comes from their browser instead. Falls back to the database date.export const daySql = (value: unknown) => {
export const daySql = (value: unknown) => {
    const t = typeof value === "string" ? value : "";
    const d = new Date(t);
    const valid =
        /^\d{4}-\d{2}-\d{2}$/.test(t) &&
        !Number.isNaN(d.getTime()) &&
        d.toISOString().slice(0, 10) === t;
    return valid ? sql`${t}::date` : sql`CURRENT_DATE`;
};

export const todaySql = (req: Request) => daySql(req.query.today);