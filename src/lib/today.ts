import type { Request } from "express";
import { sql } from "drizzle-orm";

// Postgres CURRENT_DATE is in the database's timezone (UTC on Neon), so it flips to tomorrow at 5 pm Vancouver time.
// The coach's own "today" (yyyy-mm-dd) comes from their browser instead.

// true only for a real calendar day written as yyyy-mm-dd (rejects "2026-02-31", "abc", missing values)
export const isValidDay = (value: unknown): value is string => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

// The coach's day as SQL. Falls back to the database date if the value is missing or invalid.
// Routes that must not guess (the dashboard) check isValidDay first and return 400.
export const daySql = (value: unknown) =>
    isValidDay(value) ? sql`${value}::date` : sql`CURRENT_DATE`;

// For GET endpoints: the day comes from ?today=
export const todaySql = (req: Request) => daySql(req.query.today);

// A whole number of days from the browser, made safe: bad or missing input gives the fallback,
// and anything else is clamped into min..max.
export const clampDays = (value: unknown, fallback: number, min = 1, max = 365): number => {
    if (typeof value === "string" && value.trim() === "") return fallback;
    const n = typeof value === "string" ? Number(value) : value;
    if (typeof n !== "number" || !Number.isInteger(n)) return fallback;
    return Math.min(max, Math.max(min, n));
};