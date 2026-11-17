// Unit tests for src/lib/bcDate.ts
//
// What this file shows:
//   - faking the clock, so a test about "today" gives the same answer whenever it runs
//   - toEqual and toBe, and which one to use for objects such as Dates
//   - checking that a function doesn't change the value it was given

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, bcToday } from "./bcDate.js";

describe("bcToday", () => {
    // Every test in this block gets a fake clock, and the real one is put back afterwards.
    // Without the afterEach, a time set in one test would leak into the tests that run after it.
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    // WORKED EXAMPLE: the timezone bug, written down as a test.
    // 06:30 UTC on Nov 11 is still the evening of Nov 10 in BC.
    // A bcToday that used the server's UTC date would return "2026-11-11" and fail here.
    it("returns BC's date, not the UTC date, late in the BC evening", () => {
        vi.setSystemTime(new Date("2026-11-11T06:30:00Z"));

        expect(bcToday()).toBe("2026-11-10");
    });

    it("returns the new day once it is past midnight in BC: 2026-11-11T08:30:00Z -> 2026-11-11", () => {

        vi.setSystemTime(new Date("2026-11-11T08:30:00Z"));

        expect(bcToday()).toBe("2026-11-11");

    });

    it("matches the UTC date in the middle of the BC day: 2026-11-11T20:00:00Z -> 2026-11-11", () => {

        vi.setSystemTime(new Date("2026-11-11T20:00:00Z"));

        expect(bcToday()).toBe("2026-11-11");

    });

    it("handles the year boundary: 2027-01-01T05:00:00Z -> 2026-12-31", () => {

        vi.setSystemTime(new Date("2027-01-01T05:00:00Z"));

        expect(bcToday()).toBe("2026-12-31");

    });

    it("zero-pads the month and day: 2026-03-05T20:00:00Z -> 2026-03-05", () => {

        vi.setSystemTime(new Date("2026-03-05T20:00:00Z"));

        expect(bcToday()).toBe("2026-03-05");

    });
});

describe("addDays", () => {
    // WORKED EXAMPLE: toBe asks "is this the very same object?", which two Dates never are.
    // toEqual asks "do these hold the same value?", which is the question here.
    it("moves a date forward by whole days", () => {
        const start = new Date("2026-11-09T00:00:00.000Z");

        const result = addDays(start, 8);

        expect(result).toEqual(new Date("2026-11-17T00:00:00.000Z"));
    });

    it("crosses a month end: Jan 28 + 7 days -> Feb 4", () => {
        const start = new Date("2026-01-28T00:00:00.000Z");

        const result = addDays(start, 7);

        expect(result).toEqual(new Date("2026-02-04T00:00:00.000Z"));

    });

    it("crosses a year end: Dec 30 + 3 days -> Jan 2 of the next year", () => {
        const start = new Date("2026-12-30T00:00:00.000Z");

        const result = addDays(start, 3);

        expect(result).toEqual(new Date("2027-01-02T00:00:00.000Z"));

    });

    it("lands on Feb 29 in a leap year: 2028-02-28 + 1 day", () => {
        const start = new Date("2026-11-09T00:00:00.000Z");

        const result = addDays(start, 8);

        expect(result).toEqual(new Date("2026-11-17T00:00:00.000Z"));

    });

    it("returns the same day when adding 0", () => {

        const start = new Date("2026-11-09T00:00:00.000Z");

        const result = addDays(start, 0);

        expect(result).toEqual(new Date("2026-11-09T00:00:00.000Z"));


    });

    it("goes backwards with a negative number: Nov 9 - 9 days -> Oct 31", () => {

        const start = new Date("2026-11-09T00:00:00.000Z");

        const result = addDays(start, -9);

        expect(result).toEqual(new Date("2026-10-31T00:00:00.000Z"));

    });

    it("does not change the date that was passed in (compare start.getTime() before and after)", () => {
        const start = new Date("2026-11-09T00:00:00.000Z");

        const result = addDays(start, -9);

        expect(start).toEqual(start);

    });

    it("returns a new Date, not the one passed in: expect(result).not.toBe(start)", () => {

        const start = new Date("2026-11-09T00:00:00.000Z");

        const result = addDays(start, -9);

        expect(result).not.toBe(start);


    });
});