// Unit tests for src/lib/today.ts
//
// Run them with:   npm test
//
// What this file shows:
//   - describe / it / expect, the three building blocks of every test
//   - it.each, one test body run over a table of inputs
//   - it.todo, a named test you still have to write (it shows as "todo" in the output)
//
// To write a todo: change  it.todo("name")  into  it("name", () => { ... })
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

    it.todo("accepts a leap day in a leap year: 2028-02-29");
    it.todo("rejects a leap day in a non-leap year: 2026-02-29");
    it.todo("rejects the wrong format: 11/11/2026");
    it.todo("rejects missing zero padding: 2026-1-5");
    it.todo("rejects a full timestamp: 2026-11-11T00:00:00.000Z");
    it.todo("rejects an empty string");

    // WORKED EXAMPLE: it.each runs the same test once per row, and %s puts the label in the name.
    // The value comes from a browser, so it can be anything at all, not only a string.
    it.each([
        ["undefined", undefined],
        ["null", null],
        ["a number", 20261111],
    ])("rejects %s", (_label, value) => {
        expect(isValidDay(value)).toBe(false);
    });

    it.todo("rejects an array, an object and a Date (add rows to the table above)");
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

    it.todo("returns the fallback for a decimal: '2.5'");
    it.todo("returns the fallback for undefined and null");
    it.todo("accepts a real number as well as a numeric string: 30 and '30'");
    it.todo("raises a value below the minimum to the minimum: '0' -> 1");
    it.todo("raises a negative value to the minimum: '-5' -> 1");
    it.todo("lowers a value above the maximum to the maximum: '9999' -> 365.25");
    it.todo("uses a custom min and max when they are passed in: clampDays('50', 4, 10, 20) -> 20");
});
