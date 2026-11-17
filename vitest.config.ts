// Settings for the tests.

import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        // only the tests that sit next to the source, never compiled copies in dist/
        include: ["src/**/*.test.ts"],
    },
});
