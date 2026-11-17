// Date helpers for the nightly jobs.
//
// The jobs run on a server whose clock is UTC, so "today" is worked out for BC on purpose,
// and day arithmetic is done in UTC so a stored calendar day never shifts.
//
// These two functions are copied unchanged from the job files, so they can be tested here.
// The job files still have their own copies: replace those with
//     import { addDays, bcToday } from "../lib/bcDate.js";
// so the jobs run the same code the tests check.

export const BC_TZ = "America/Vancouver";

// today's date in BC as "YYYY-MM-DD" (en-CA formats dates that way)
export function bcToday(): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: BC_TZ }).format(new Date());
}

// a copy of `date` moved by `days` whole days; the date passed in is not changed
export function addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
}
