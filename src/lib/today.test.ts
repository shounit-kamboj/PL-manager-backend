// Unit tests for src/lib/today.ts
//
// Run them with:   npm test
//
// What this file shows:
//   - describe / it / expect, the three building blocks of every test
//   - it.each, one test body run over a table of inputs
//
// The empty tests are still to be written: add an expect(...) inside each one.
// An empty test passes, so it shows as green until you fill it in.
//
// Not tested here: daySql and todaySql. They only wrap the result of isValidDay in a piece
// of SQL, so the rule worth testing is isValidDay.

import { describe, expect, it } from "vitest";
import { clampDays, isValidDay } from "./today.js";

describe("isValidDay", () => {
    // WORKED EXAMPLE: call the function with a known input, then state what must come back
    it("accepts a real calendar day written as yyyy-mm-dd", () => {
        expect(isValidDay("2026-11-11")).toBe(true);
    });

    // WORKED EXAMPLE: test what must be refused, not only what must be accepted.
    // Feb 31 has the right shape, so this proves the "is it a real day" check does its job.
    it("rejects a day that doesn't exist", () => {
        expect(isValidDay("2026-02-31")).toBe(false);
    });

    it("accepts a leap day in a leap year: 2028-02-29", () => {
        expect(isValidDay("2028-02-29")).toBe(true);

    });

    it("rejects a leap day in a non-leap year: 2026-02-29", () => {
        expect(isValidDay("2026-02-29")).toBe(false);

    });

    it("rejects the wrong format: 11/11/2026", () => {
        expect(isValidDay("11/11/2026")).toBe(false);

    });

    it("rejects missing zero padding: 2026-1-5", () => {
        expect(isValidDay("1/5/2026")).toBe(false);

    });

    it("rejects a full timestamp: 2026-11-11T00:00:00.000Z", () => {
        expect(isValidDay("2026-11-11T00:00:00.000Z")).toBe(false);

    });

    it("rejects an empty string", () => {
        expect(isValidDay("")).toBe(false);

    });
    it("rejects a space filled string", () => {
        expect(isValidDay("   ")).toBe(false);

    });

    // WORKED EXAMPLE: it.each runs the same test once per row, and %s puts the label in the name.
    // The value comes from a browser, so it can be anything at all, not only a string.
    it.each([
        ["undefined", undefined],
        ["null", null],
        ["a number", 20261111],
    ])("rejects %s", (_label, value) => {
        expect(isValidDay(value)).toBe(false);
    });

    it("rejects an array, an object and a Date (add rows to the table above)", () => {

    });
});

describe("clampDays", () => {
    // WORKED EXAMPLE: the second argument is the fallback, so 4 here would mean "input was refused"
    it("returns a whole number that is inside the range", () => {
        expect(clampDays("30", 4)).toBe(30);
    });

    // WORKED EXAMPLE: a table of bad inputs that must all give the fallback
    it.each([
        ["an empty string", ""],
        ["only spaces", "   "],
        ["text", "abc"],
    ])("returns the fallback for %s", (_label, value) => {
        expect(clampDays(value, 4)).toBe(4);
    });

    it("returns the fallback for a decimal: '2.5'", () => {
        expect(clampDays(4.6, 4)).toBe(4);


    });


    it.each([
            ["unefined",undefined],
            ["null",null],
        ])("returns the fallback for undefined and null", (_label, value) => {
            expect(clampDays(value, 4)).toBe(4);
        });



    it("accepts a real number as well as a numeric string: 30 and '30'", () => {
        expect(clampDays("30", 4)).toBe(30);

    });

    it("raises a value below the minimum to the minimum: '0' -> 1", () => {
        expect(clampDays(0,10)).toBe(1);


    });

    it("raises a negative value to the minimum: '-5' -> 1", () => {
        expect(clampDays(-5,10)).toBe(1);


    });

    it("lowers a value above the maximum to the maximum: '9999' -> 365.25", () => {
        expect(clampDays(999999,10)).toBe(365.25);


    });

    it("uses a custom min and max when they are passed in: clampDays('50', 4, 10, 20) -> 20", () => {

        expect(clampDays('50', 4, 10, 20)).toBe(20);

    });
});